import Stripe from 'stripe';
import {randomUUID,randomBytes} from 'node:crypto';
import {plans} from '../public/pricing.js';
import {ApiError} from './validation.mjs';
import {rawBody} from './connect/store.mjs';
import {checkoutKybAccess,checkoutOrderKybAccess} from './billing-kyb.mjs';

export function stripePlanCheckout({db,json,readBody,env=process.env,clientFactory=key=>new Stripe(key,{apiVersion:'2026-09-30.endive',maxNetworkRetries:1})}){
 const client=mode=>{const key=env[`PRIME_STRIPE_${mode.toUpperCase()}_SECRET_KEY`];if(mode==='test'&&!/^(sk|rk|rkcs)_test_/.test(key||''))throw new ApiError(503,'Stripe test non configurato. Nessun pagamento reale è disponibile.');if(mode==='live'&&!/^(sk|rk|rkcs)_live_/.test(key||''))throw new ApiError(503,'Pagamenti Stripe live non ancora configurati.');return clientFactory(key);};
 const liveReady=()=>/^(sk|rk|rkcs)_live_/.test(env.PRIME_STRIPE_LIVE_SECRET_KEY||'')&&/^pk_live_/.test(env.PRIME_STRIPE_LIVE_PUBLISHABLE_KEY||'')&&/^whsec_/.test(env.PRIME_STRIPE_LIVE_BILLING_WEBHOOK_SECRET||'');
 const liveProducts={standard:'prod_VX1VfxuOSsiQ1r',pro:'prod_VX1V9gRhdAEjw0',vip:'prod_VX1VSc1ybIDTlH',elite:'prod_VX1VMjqDlqulM2'};
 function activateOrder(order,subscription){
  if(subscription?.livemode===false||!['active','trialing'].includes(subscription?.status))return false;
  const item=subscription.items?.data?.[0]||subscription,startSeconds=item.current_period_start??subscription.current_period_start,endSeconds=item.current_period_end??subscription.current_period_end;
  if(!Number.isFinite(startSeconds)||!Number.isFinite(endSeconds))return false;
  const periodStart=new Date(startSeconds*1000).toISOString(),periodEnd=new Date(endSeconds*1000).toISOString();
  db.prepare("INSERT INTO plan_subscriptions VALUES (?,?,?,?,?,?,?,1,'active') ON CONFLICT(tenant_id) DO UPDATE SET plan=excluded.plan,cycle=excluded.cycle,period_start=excluded.period_start,period_end=excluded.period_end,paid_plan_cents=excluded.paid_plan_cents,payment_reference=excluded.payment_reference,revision=plan_subscriptions.revision+1,state='active'").run(order.tenant_id,order.plan,order.cycle,periodStart,periodEnd,order.cents,'stripe:'+subscription.id);
  if(['vip','elite'].includes(order.plan))db.prepare("INSERT INTO ai_subscriptions VALUES (?,?,?,?,'active') ON CONFLICT(tenant_id) DO UPDATE SET plan=excluded.plan,billing_anchor=excluded.billing_anchor,billing_cycle=excluded.billing_cycle,state='active'").run(order.tenant_id,order.plan,periodStart,order.cycle);
  else db.prepare("UPDATE ai_subscriptions SET state='suspended' WHERE tenant_id=?").run(order.tenant_id);
  db.prepare("UPDATE stripe_live_checkouts SET subscription_id=?,state='active' WHERE id=?").run(subscription.id,order.id);
  return true;
 }
 async function findFirstMonthPromotion(c,code,plan,cycle){
  const normalized=String(code||'').trim().replace(/\s+/g,' ').toUpperCase();if(!normalized)return null;
  if(normalized!=='SAN GOTTARDO'||!['vip','elite'].includes(plan)||cycle!=='monthly')throw new ApiError(400,'Il codice SAN GOTTARDO vale solo sul primo mese dei piani VIP ed Elite con fatturazione mensile.');
  const matches=await c.promotionCodes.list({code:normalized,active:true,limit:100,expand:['data.coupon']});
  const promo=matches.data.find(item=>String(item.code||'').trim().replace(/\s+/g,' ').toUpperCase()===normalized&&item.active&&(!item.expires_at||item.expires_at>Date.now()/1000)&&!item.customer);
  if(!promo)throw new ApiError(400,'Codice promozionale non attivo o non ancora creato in Stripe.');
  const coupon=typeof promo.coupon==='string'?await c.coupons.retrieve(promo.coupon):promo.coupon;
  if(!coupon?.valid||coupon.percent_off!==50||coupon.duration!=='once')throw new ApiError(400,'Il codice deve avere uno sconto del 50% sul primo mese.');
  const eligible=coupon.applies_to?.products;if(Array.isArray(eligible)&&eligible.length&&!eligible.includes(liveProducts[plan]))throw new ApiError(400,'Il codice non è valido per questo piano.');
  return promo.id;
 }
 async function publicRoute(req,res,url){
  if(url.pathname==='/api/billing/stripe-live/webhook'){
   if(req.method!=='POST')throw new ApiError(405,'Metodo non consentito.');
   const secret=env.PRIME_STRIPE_LIVE_BILLING_WEBHOOK_SECRET;if(!secret)throw new ApiError(503,'Webhook Stripe live non configurato.');
   let event;try{event=client('live').webhooks.constructEvent(await rawBody(req),req.headers['stripe-signature'],secret);}catch{throw new ApiError(400,'Firma Stripe non valida.');}
   if(!event.livemode)throw new ApiError(400,'Sono ammessi solo eventi Stripe live.');
   if(!db.prepare('SELECT 1 FROM stripe_live_events WHERE event_id=?').get(event.id)){
    const object=event.data.object,now=new Date().toISOString();
    if(['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type)&&object.mode==='subscription'){
     const order=db.prepare('SELECT * FROM stripe_live_checkouts WHERE session_id=?').get(object.id);
     if(order){
      const subscriptionId=typeof object.subscription==='string'?object.subscription:object.subscription?.id;
      if(subscriptionId&&object.payment_status==='paid'&&checkoutOrderKybAccess(db,order,env).allowed){
       const subscription=await client('live').subscriptions.retrieve(subscriptionId);
       activateOrder(order,subscription);
      }else db.prepare("UPDATE stripe_live_checkouts SET state=? WHERE id=?").run(object.payment_status==='paid'?'pending_kyb':'pending_payment',order.id);
     }
    }else if(['invoice.paid','invoice.payment_failed'].includes(event.type)){
     const subscriptionId=typeof object.subscription==='string'?object.subscription:object.subscription?.id||object.parent?.subscription_details?.subscription;
     const order=subscriptionId?db.prepare('SELECT * FROM stripe_live_checkouts WHERE subscription_id=?').get(subscriptionId):null;
     if(order?.payment_method==='bank_transfer'){
      if(event.type==='invoice.paid'&&object.status==='paid'&&checkoutOrderKybAccess(db,order,env).allowed){
       const subscription=await client('live').subscriptions.retrieve(subscriptionId);
       if(activateOrder(order,subscription))db.prepare("UPDATE stripe_live_checkouts SET invoice_id=?,state='active' WHERE id=?").run(object.id,order.id);
      }else if(event.type==='invoice.payment_failed')db.prepare("UPDATE stripe_live_checkouts SET state=CASE WHEN state='active' THEN state ELSE 'payment_failed' END WHERE id=?").run(order.id);
     }
    }else if(event.type==='customer.subscription.updated'||event.type==='customer.subscription.deleted'){
     const order=db.prepare('SELECT * FROM stripe_live_checkouts WHERE subscription_id=?').get(object.id);
     if(order){
      const active=event.type!=='customer.subscription.deleted'&&['active','trialing'].includes(object.status);
      const state=active?'active':object.status==='canceled'?'cancelled':'suspended';
      if(order.payment_method==='bank_transfer'){
       if(!active){db.prepare('UPDATE plan_subscriptions SET state=?,revision=revision+1 WHERE tenant_id=? AND payment_reference=?').run(state,order.tenant_id,'stripe:'+object.id);db.prepare("UPDATE ai_subscriptions SET state='suspended' WHERE tenant_id=?").run(order.tenant_id);db.prepare('UPDATE stripe_live_checkouts SET state=? WHERE id=?').run(state,order.id);}
      }else{
       const item=object.items?.data?.[0]||object; const start=item.current_period_start?new Date(item.current_period_start*1000).toISOString():null,end=item.current_period_end?new Date(item.current_period_end*1000).toISOString():null;
       db.prepare('UPDATE plan_subscriptions SET state=?,period_start=COALESCE(?,period_start),period_end=COALESCE(?,period_end),revision=revision+1 WHERE tenant_id=? AND payment_reference=?').run(state,start,end,order.tenant_id,'stripe:'+object.id);
       if(['vip','elite'].includes(order.plan)){if(active)db.prepare("INSERT INTO ai_subscriptions VALUES (?,?,?,?,'active') ON CONFLICT(tenant_id) DO UPDATE SET plan=excluded.plan,billing_anchor=excluded.billing_anchor,billing_cycle=excluded.billing_cycle,state='active'").run(order.tenant_id,order.plan,start||order.created_at,order.cycle);else db.prepare("UPDATE ai_subscriptions SET state='suspended' WHERE tenant_id=?").run(order.tenant_id);}
       else db.prepare("UPDATE ai_subscriptions SET state='suspended' WHERE tenant_id=?").run(order.tenant_id);
       db.prepare('UPDATE stripe_live_checkouts SET state=? WHERE id=?').run(state,order.id);
      }
     }
    }
    db.prepare('INSERT INTO stripe_live_events VALUES(?,?,?)').run(event.id,event.type,now);
   }
   json(res,200,{received:true,live:true});return true;
  }
  if(url.pathname!=='/api/billing/stripe-test/webhook')return false;
  if(req.method!=='POST')throw new ApiError(405,'Metodo non consentito.');
  const secret=env.PRIME_STRIPE_TEST_BILLING_WEBHOOK_SECRET;if(!secret)throw new ApiError(503,'Webhook Stripe test non configurato.');
  let event;try{event=client('test').webhooks.constructEvent(await rawBody(req),req.headers['stripe-signature'],secret);}catch{throw new ApiError(400,'Firma Stripe non valida.');}
  if(event.livemode)throw new ApiError(400,'Sono ammessi solo eventi Stripe test.');
  if(!db.prepare('SELECT 1 FROM stripe_test_events WHERE event_id=?').get(event.id)){
   const object=event.data.object;
   if(event.type.startsWith('checkout.session.'))db.prepare('UPDATE stripe_test_checkouts SET state=? WHERE session_id=?').run(object.payment_status==='paid'?'test_paid':event.type.endsWith('failed')?'test_failed':object.status==='expired'?'expired':'pending',object.id);
   db.prepare('INSERT INTO stripe_test_events VALUES(?,?,?)').run(event.id,event.type,new Date().toISOString());
  }
  // Test purchases never create or modify real subscriptions or usage allowances.
  json(res,200,{received:true,test:true});return true;
 }
 async function route(req,res,url,s){
  if(url.pathname==='/api/billing/stripe/live/config'&&req.method==='GET'){
   json(res,200,{available:liveReady()});return true;
  }
  if(url.pathname.startsWith('/api/billing/stripe/live/')){
   if(s.role!=='owner')throw new ApiError(403,'Solo il titolare può aprire il checkout.');
   if(!liveReady())throw new ApiError(503,'Stripe live non è ancora pronto: mancano le credenziali o il webhook firmato.');
   if(['/api/billing/stripe/live/checkout','/api/billing/stripe/live/bank-transfer'].includes(url.pathname)&&req.method==='POST'){
    if(!checkoutKybAccess(db,{tenantId:s.tenant_id,userId:s.user_id,env}).allowed)throw new ApiError(403,'Attendi l’approvazione della verifica aziendale prima del pagamento.');
    const b=await readBody(req),p=Object.hasOwn(plans,b.plan)?plans[b.plan]:null;
    if(!p||!['monthly','annual'].includes(b.cycle)||!['it','en'].includes(b.language)||!/^[a-f0-9-]{36}$/.test(b.requestKey||''))throw new ApiError(400,'Piano, lingua o richiesta non validi.');
    const paymentMethod=url.pathname.endsWith('/bank-transfer')?'bank_transfer':'card';
    const isAI=!!p.ai,count=b[isAI?'ai':'humans']??(isAI?p.ai:p.humans);if(!Number.isSafeInteger(count)||count<(isAI?p.ai:p.humans)||count>1000)throw new ApiError(400,'Numero agenti non valido.');
    const extra=Math.max(0,count-(isAI?p.ai:p.humans))*(isAI?p.aiExtra:p.humanExtra),cents=Math.round((b.cycle==='annual'?p.annual+extra*12:p.monthly+extra)*100),discountCode=String(b.discountCode||'').trim().replace(/\s+/g,' ').toUpperCase()||null;
    const c=client('live'),prior=db.prepare('SELECT * FROM stripe_live_checkouts WHERE tenant_id=? AND request_key=?').get(s.tenant_id,b.requestKey);
    if(prior&&(prior.plan!==b.plan||prior.cycle!==b.cycle||prior.cents!==cents||prior.discount_code!==discountCode||prior.payment_method!==paymentMethod))throw new ApiError(409,'Richiesta già associata a un altro ordine.');
    const id=prior?.id||randomUUID(),promotionId=prior?.session_id?null:await findFirstMonthPromotion(c,discountCode,b.plan,b.cycle),initialCents=promotionId?Math.round(cents/2):cents;
    if(!prior)db.prepare('INSERT INTO stripe_live_checkouts(id,tenant_id,user_id,plan,cycle,cents,initial_cents,discount_code,request_key,created_at,payment_method) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(id,s.tenant_id,s.user_id,b.plan,b.cycle,cents,initialCents,discountCode,b.requestKey,new Date().toISOString(),paymentMethod);
    if(paymentMethod==='bank_transfer'){
     let customerRow=db.prepare('SELECT * FROM stripe_live_billing_customers WHERE tenant_id=?').get(s.tenant_id),customer=customerRow?await c.customers.retrieve(customerRow.customer_id):null;
     if(customer?.deleted)customer=null;
     if(!customer){customer=await c.customers.create({email:s.email,name:s.tenant_name||undefined,metadata:{prime_tenant_id:s.tenant_id,prime_owner_user_id:s.user_id}},{idempotencyKey:'prime-live-bank-customer:'+s.tenant_id});db.prepare('INSERT INTO stripe_live_billing_customers(tenant_id,customer_id,email,created_at,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(tenant_id) DO UPDATE SET customer_id=excluded.customer_id,email=excluded.email,updated_at=excluded.updated_at').run(s.tenant_id,customer.id,s.email,new Date().toISOString(),new Date().toISOString());}
     else if(customer.email!==s.email||customer.name!==(s.tenant_name||null)){customer=await c.customers.update(customer.id,{email:s.email,name:s.tenant_name||''});db.prepare('UPDATE stripe_live_billing_customers SET email=?,updated_at=? WHERE tenant_id=?').run(s.email,new Date().toISOString(),s.tenant_id);}
     const back=new URL(env.PRIME_PUBLIC_URL||url.origin).origin+'/checkout?choose=live&method=bank&plan='+b.plan+'&cycle='+b.cycle+'&lang='+b.language;
    const subscription=prior?.subscription_id?await c.subscriptions.retrieve(prior.subscription_id):await c.subscriptions.create({customer:customer.id,collection_method:'send_invoice',days_until_due:7,items:[{price_data:{currency:'eur',unit_amount:cents,recurring:{interval:b.cycle==='annual'?'year':'month'},product:liveProducts[b.plan]},quantity:1}],...(promotionId?{discounts:[{promotion_code:promotionId}]}:{}),payment_settings:{payment_method_options:{customer_balance:{funding_type:'bank_transfer',bank_transfer:{type:'eu_bank_transfer',eu_bank_transfer:{country:'FR'}}}}},metadata:{prime_live_order:id,prime_payment_method:'bank_transfer'},cancel_at_period_end:false,description:'PRIME '+p.name+' · '+(b.cycle==='annual'?'annual':'monthly')+' · bank transfer renewal'},{idempotencyKey:'prime-bank-live:'+id});
     if(subscription.livemode===false)throw new ApiError(409,'La fattura non è in modalità live.');
     const invoiceId=typeof subscription.latest_invoice==='string'?subscription.latest_invoice:subscription.latest_invoice?.id;if(!invoiceId)throw new ApiError(502,'Stripe non ha creato la fattura del bonifico.');
     let invoice=await c.invoices.retrieve(invoiceId);if(invoice.status==='draft')invoice=await c.invoices.finalizeInvoice(invoiceId);
     if(!invoice.hosted_invoice_url){invoice=await c.invoices.retrieve(invoiceId);}
     if(!invoice.hosted_invoice_url)throw new ApiError(502,'La fattura Stripe non è ancora disponibile. Riprova tra poco.');
     db.prepare("UPDATE stripe_live_checkouts SET customer_id=?,subscription_id=?,invoice_id=?,state=CASE WHEN state='active' THEN state ELSE 'pending_payment' END WHERE id=?").run(customer.id,subscription.id,invoice.id,id);
     json(res,200,{url:invoice.hosted_invoice_url,orderId:id,live:true,method:'bank_transfer',renewal:'manual_invoice'});return true;
    }
    const origin=new URL(env.PRIME_PUBLIC_URL||url.origin).origin,back=origin+'/checkout?live=1&plan='+b.plan+'&cycle='+b.cycle+'&lang='+b.language;
    const session=prior?.session_id?await c.checkout.sessions.retrieve(prior.session_id):await c.checkout.sessions.create({mode:'subscription',ui_mode:'elements',adaptive_pricing:{enabled:!promotionId},locale:b.language,customer_email:s.email,client_reference_id:id,line_items:[{price_data:{currency:'eur',unit_amount:cents,recurring:{interval:b.cycle==='annual'?'year':'month'},product:liveProducts[b.plan]},quantity:1}],...(promotionId?{discounts:[{promotion_code:promotionId}]}:{}),metadata:{prime_live_order:id},subscription_data:{metadata:{prime_live_order:id}},return_url:back+'&order='+id+'&session_id={CHECKOUT_SESSION_ID}'},{idempotencyKey:'prime-plan-live:'+id});
    if(!session.livemode)throw new ApiError(409,'Il checkout non è in modalità live.');
    db.prepare('UPDATE stripe_live_checkouts SET session_id=?,state=? WHERE id=?').run(session.id,'pending',id);json(res,200,{url:back+'&order='+id,orderId:id,live:true});return true;
   }
   if(['/api/billing/stripe/live/status','/api/billing/stripe/live/session'].includes(url.pathname)&&req.method==='GET'){
    const row=db.prepare('SELECT * FROM stripe_live_checkouts WHERE id=? AND tenant_id=? AND user_id=?').get(url.searchParams.get('order'),s.tenant_id,s.user_id);if(!row?.session_id)throw new ApiError(404,'Ordine Stripe non trovato.');
    const session=await client('live').checkout.sessions.retrieve(row.session_id);if(!session.livemode)throw new ApiError(409,'Ordine non live.');
    if(url.pathname.endsWith('/session')){res.setHeader?.('Cache-Control','no-store');json(res,200,{clientSecret:session.client_secret,publishableKey:env.PRIME_STRIPE_LIVE_PUBLISHABLE_KEY,status:session.status,paymentStatus:session.payment_status,plan:row.plan,amount:row.initial_cents,cycle:row.cycle,discountCode:row.discount_code});return true;}
    json(res,200,{live:true,state:row.state,plan:row.plan,cents:row.cents});return true;
   }
   throw new ApiError(404,'Operazione checkout live non disponibile.');
  }
  if(!url.pathname.startsWith('/api/billing/stripe-test/'))return false;
  if(s.role!=='owner')throw new ApiError(403,'Solo il titolare può aprire il checkout.');
  if(url.pathname==='/api/billing/stripe-test/checkout'&&req.method==='POST'){
   if(db.prepare('SELECT kyb_status FROM agency_billing WHERE tenant_id=?').get(s.tenant_id)?.kyb_status!=='approved')throw new ApiError(403,'Attendi l’approvazione della verifica aziendale prima del pagamento.');
   const b=await readBody(req),p=Object.hasOwn(plans,b.plan)?plans[b.plan]:null;
   if(!p||!['monthly','annual'].includes(b.cycle)||!['it','en'].includes(b.language)||!/^[a-f0-9-]{36}$/.test(b.requestKey||''))throw new ApiError(400,'Piano, lingua o richiesta non validi.');
   const included=p.ai||p.humans,count=b[p.ai?'ai':'humans']??included;if(!Number.isSafeInteger(count)||count<included||count>1000)throw new ApiError(400,'Numero agenti non valido.');
   const extra=Math.max(0,count-included)*(p.ai?p.aiExtra:p.humanExtra),cents=Math.round((b.cycle==='annual'?p.annual+extra*12:p.monthly+extra)*100);
   const c=client('test'),prior=db.prepare('SELECT * FROM stripe_test_checkouts WHERE tenant_id=? AND request_key=?').get(s.tenant_id,b.requestKey);
   if(prior&&(prior.plan!==b.plan||prior.cycle!==b.cycle||prior.cents!==cents))throw new ApiError(409,'Richiesta già associata a un altro ordine.');
   const id=prior?.id||randomUUID();if(!prior)db.prepare('INSERT INTO stripe_test_checkouts(id,tenant_id,user_id,plan,cycle,cents,request_key,created_at) VALUES(?,?,?,?,?,?,?,?)').run(id,s.tenant_id,s.user_id,b.plan,b.cycle,cents,b.requestKey,new Date().toISOString());
   const origin=new URL(env.PRIME_PUBLIC_URL||url.origin).origin,back=origin+'/checkout?test=1&plan='+b.plan+'&cycle='+b.cycle+'&lang='+b.language;
   const session=prior?.session_id?await c.checkout.sessions.retrieve(prior.session_id):await c.checkout.sessions.create({mode:'subscription',ui_mode:'elements',adaptive_pricing:{enabled:true},locale:b.language,customer_email:s.email,client_reference_id:id,line_items:[{price_data:{currency:'eur',unit_amount:cents,recurring:{interval:b.cycle==='annual'?'year':'month'},product_data:{name:'PRIME '+p.name+' · TEST'}},quantity:1}],metadata:{prime_test_order:id},subscription_data:{metadata:{prime_test_order:id}},return_url:back+'&order='+id+'&session_id={CHECKOUT_SESSION_ID}',integration_identifier:'prime_test_'+randomBytes(8).toString('hex').replace(/[0-9]/g,'a')},{idempotencyKey:'prime-plan-test:'+id});
   if(session.livemode)throw new ApiError(409,'Il checkout deve essere in modalità test.');
   db.prepare('UPDATE stripe_test_checkouts SET session_id=?,state=? WHERE id=?').run(session.id,'pending',id);json(res,200,{url:back+'&order='+id,orderId:id,test:true});return true;
  }
  if(['/api/billing/stripe-test/status','/api/billing/stripe-test/session'].includes(url.pathname)&&req.method==='GET'){
   const row=db.prepare('SELECT * FROM stripe_test_checkouts WHERE id=? AND tenant_id=? AND user_id=?').get(url.searchParams.get('order'),s.tenant_id,s.user_id);if(!row?.session_id)throw new ApiError(404,'Ordine di test non trovato.');
   const session=await client('test').checkout.sessions.retrieve(row.session_id);if(session.livemode)throw new ApiError(409,'Ordine non test.');if(url.pathname.endsWith('/session')){if(!/^pk_test_/.test(env.PRIME_STRIPE_TEST_PUBLISHABLE_KEY||''))throw new ApiError(503,'Chiave pubblicabile Stripe test non configurata.');res.setHeader?.('Cache-Control','no-store');json(res,200,{clientSecret:session.client_secret,publishableKey:env.PRIME_STRIPE_TEST_PUBLISHABLE_KEY,status:session.status,paymentStatus:session.payment_status,plan:row.plan,amount:row.cents,cycle:row.cycle});return true;}json(res,200,{test:true,state:session.payment_status==='paid'?'test_paid':session.status,plan:row.plan,cents:row.cents});return true;
  }
  throw new ApiError(404,'Operazione checkout test non disponibile.');
 }
 return {route:async(...args)=>{try{return await route(...args);}catch(error){if(error instanceof ApiError)throw error;throw new ApiError(502,'Ambiente di test Stripe non disponibile. Contatta l’assistenza.');}},publicRoute};
}
