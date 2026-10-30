import Stripe from 'stripe';
import {randomUUID,randomBytes} from 'node:crypto';
import {plans} from '../public/pricing.js';
import {ApiError} from './validation.mjs';
import {rawBody} from './connect/store.mjs';

export function stripePlanCheckout({db,json,readBody,env=process.env,clientFactory=key=>new Stripe(key,{apiVersion:'2026-09-30.endive',maxNetworkRetries:1})}){
 const client=()=>{const key=env.PRIME_STRIPE_TEST_SECRET_KEY;if(!/^(sk|rk|rkcs)_test_/.test(key||''))throw new ApiError(503,'Stripe test non configurato. Nessun pagamento reale è disponibile.');return clientFactory(key);};
 async function publicRoute(req,res,url){
  if(url.pathname!=='/api/billing/stripe-test/webhook')return false;
  if(req.method!=='POST')throw new ApiError(405,'Metodo non consentito.');
  const secret=env.PRIME_STRIPE_TEST_BILLING_WEBHOOK_SECRET;if(!secret)throw new ApiError(503,'Webhook Stripe test non configurato.');
  let event;try{event=client().webhooks.constructEvent(await rawBody(req),req.headers['stripe-signature'],secret);}catch{throw new ApiError(400,'Firma Stripe non valida.');}
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
  if(!url.pathname.startsWith('/api/billing/stripe-test/'))return false;
  if(s.role!=='owner')throw new ApiError(403,'Solo il titolare può aprire il checkout.');
  if(url.pathname==='/api/billing/stripe-test/checkout'&&req.method==='POST'){
   if(db.prepare('SELECT kyb_status FROM agency_billing WHERE tenant_id=?').get(s.tenant_id)?.kyb_status!=='approved')throw new ApiError(403,'Attendi l’approvazione della verifica aziendale prima del pagamento.');
   const b=await readBody(req),p=Object.hasOwn(plans,b.plan)?plans[b.plan]:null;
   if(!p||!['monthly','annual'].includes(b.cycle)||!['it','en'].includes(b.language)||!/^[a-f0-9-]{36}$/.test(b.requestKey||''))throw new ApiError(400,'Piano, lingua o richiesta non validi.');
   const included=p.ai||p.humans,count=b[p.ai?'ai':'humans']??included;if(!Number.isSafeInteger(count)||count<included||count>1000)throw new ApiError(400,'Numero agenti non valido.');
   const extra=Math.max(0,count-included)*(p.ai?p.aiExtra:p.humanExtra),cents=Math.round((b.cycle==='annual'?p.annual+extra*12:p.monthly+extra)*100);
   const c=client(),prior=db.prepare('SELECT * FROM stripe_test_checkouts WHERE tenant_id=? AND request_key=?').get(s.tenant_id,b.requestKey);
   if(prior&&(prior.plan!==b.plan||prior.cycle!==b.cycle||prior.cents!==cents))throw new ApiError(409,'Richiesta già associata a un altro ordine.');
   const id=prior?.id||randomUUID();if(!prior)db.prepare('INSERT INTO stripe_test_checkouts(id,tenant_id,user_id,plan,cycle,cents,request_key,created_at) VALUES(?,?,?,?,?,?,?,?)').run(id,s.tenant_id,s.user_id,b.plan,b.cycle,cents,b.requestKey,new Date().toISOString());
   const origin=new URL(env.PRIME_PUBLIC_URL||url.origin).origin,back=origin+'/checkout?test=1&plan='+b.plan+'&cycle='+b.cycle+'&lang='+b.language;
   const session=prior?.session_id?await c.checkout.sessions.retrieve(prior.session_id):await c.checkout.sessions.create({mode:'subscription',ui_mode:'elements',adaptive_pricing:{enabled:true},locale:b.language,customer_email:s.email,client_reference_id:id,line_items:[{price_data:{currency:'eur',unit_amount:cents,recurring:{interval:b.cycle==='annual'?'year':'month'},product_data:{name:'PRIME '+p.name+' · TEST'}},quantity:1}],metadata:{prime_test_order:id},subscription_data:{metadata:{prime_test_order:id}},return_url:back+'&order='+id+'&session_id={CHECKOUT_SESSION_ID}',integration_identifier:'prime_test_'+randomBytes(8).toString('hex').replace(/[0-9]/g,'a')},{idempotencyKey:'prime-plan-test:'+id});
   if(session.livemode)throw new ApiError(409,'Il checkout deve essere in modalità test.');
   db.prepare('UPDATE stripe_test_checkouts SET session_id=?,state=? WHERE id=?').run(session.id,'pending',id);json(res,200,{url:back+'&order='+id,orderId:id,test:true});return true;
  }
  if(['/api/billing/stripe-test/status','/api/billing/stripe-test/session'].includes(url.pathname)&&req.method==='GET'){
   const row=db.prepare('SELECT * FROM stripe_test_checkouts WHERE id=? AND tenant_id=? AND user_id=?').get(url.searchParams.get('order'),s.tenant_id,s.user_id);if(!row?.session_id)throw new ApiError(404,'Ordine di test non trovato.');
   const session=await client().checkout.sessions.retrieve(row.session_id);if(session.livemode)throw new ApiError(409,'Ordine non test.');if(url.pathname.endsWith('/session')){if(!/^pk_test_/.test(env.PRIME_STRIPE_TEST_PUBLISHABLE_KEY||''))throw new ApiError(503,'Chiave pubblicabile Stripe test non configurata.');res.setHeader?.('Cache-Control','no-store');json(res,200,{clientSecret:session.client_secret,publishableKey:env.PRIME_STRIPE_TEST_PUBLISHABLE_KEY,status:session.status,paymentStatus:session.payment_status,plan:row.plan,amount:row.cents,cycle:row.cycle});return true;}json(res,200,{test:true,state:session.payment_status==='paid'?'test_paid':session.status,plan:row.plan,cents:row.cents});return true;
  }
  throw new ApiError(404,'Operazione checkout test non disponibile.');
 }
 return {route:async(...args)=>{try{return await route(...args);}catch(error){if(error instanceof ApiError)throw error;throw new ApiError(502,'Ambiente di test Stripe non disponibile. Contatta l’assistenza.');}},publicRoute};
}
