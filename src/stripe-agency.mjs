import Stripe from 'stripe';
import {randomUUID,randomBytes} from 'node:crypto';
import {ApiError} from './validation.mjs';
import {rawBody} from './connect/store.mjs';

export function stripeAgencyAllowed(db,s,edition,now=new Date().toISOString()) {
 const paid=db.prepare("SELECT plan FROM plan_subscriptions WHERE tenant_id=? AND state='active' AND period_end>? ORDER BY revision DESC LIMIT 1").get(s.tenant_id,now);
 return paid ? ['elite','secret'].includes(paid.plan) : ['elite','secret'].includes(edition);
}
export function stripeAgencyService({db,vault,json,readBody,audit,editionFor,publicUrl,demo=false,clientFactory=(key,options={})=>new Stripe(key,{apiVersion:'2026-09-30.endive',maxNetworkRetries:1,timeout:20000,...options})}) {
 const context=(tenant,mode)=>`stripe-agency:${tenant}:${mode}`;
 const config=(tenant,mode)=>db.prepare('SELECT * FROM stripe_agency_accounts WHERE tenant_id=? AND mode=?').get(tenant,mode);
 const platformKey=mode=>process.env[`PRIME_STRIPE_${mode.toUpperCase()}_SECRET_KEY`]||process.env[`STRIPE_${mode.toUpperCase()}_SECRET_KEY`]||'';
 const platform=mode=>{const key=platformKey(mode);if(!key.startsWith(`sk_${mode}_`))throw new ApiError(503,`Stripe Connect ${mode==='test'?'Test':'Live'} non è configurato sul server PRIME.`);return clientFactory(key);};
 const secrets=row=>vault.open(row.credentials_cipher,context(row.tenant_id,row.mode));
 const client=row=>clientFactory(platformKey(row.mode),{stripeAccount:row.account_id});
 const createLink=async(row)=>platform(row.mode).accountLinks.create({account:row.account_id,refresh_url:`${publicUrl()}/api/stripe/connect/refresh?mode=${row.mode}`,return_url:`${publicUrl()}/app?stripe_connect=complete`,type:'account_onboarding'});
 const owner=s=>{if(s.role!=='owner')throw new ApiError(403,'Operazione riservata al titolare.');};
 const time=()=>new Date().toISOString();
 const modeOf=url=>{const mode=url.searchParams.get('mode')||'test';if(!['test','live'].includes(mode))throw new ApiError(400,'Ambiente non valido.');return mode;};
 const cleanPayment=row=>({id:row.id,description:row.description,amount:row.amount,currency:row.currency,state:row.state,refunded:row.refunded,checkoutUrl:row.checkout_url,createdAt:row.created_at});
 const identity=b=>{if(!/^[a-f0-9-]{36}$/.test(b.requestKey||''))throw new ApiError(400,'Riferimento richiesta non valido.');return b.requestKey;};
 async function sync(row,c) {
  const session=await c.checkout.sessions.retrieve(row.session_id);
  if(session.metadata?.prime_payment_id!==row.id)throw new ApiError(409,'Pagamento non riconosciuto.');
  let refunded=0,state=session.payment_status==='paid'?'paid':session.status==='expired'?'expired':'pending';
  const pi=typeof session.payment_intent==='string'?session.payment_intent:session.payment_intent?.id;
  if(pi){const intent=await c.paymentIntents.retrieve(pi,{expand:['latest_charge']});refunded=intent.latest_charge?.amount_refunded||0;if(refunded)state=refunded>=row.amount?'refunded':'partially_refunded';if(intent.status==='canceled')state='canceled';}
  db.prepare('UPDATE stripe_agency_payments SET state=?,refunded=?,payment_intent=?,updated_at=? WHERE id=? AND tenant_id=?').run(state,refunded,pi||null,time(),row.id,row.tenant_id);
 }
 async function publicRoute(req,res,url){
  if(demo)return false;
  if(url.pathname!=='/api/stripe/connect/webhook')return false;
  if(req.method!=='POST')throw new ApiError(405,'Metodo non consentito.');
  const body=await rawBody(req);let candidate;try{candidate=JSON.parse(body.toString('utf8'));}catch{throw new ApiError(400,'Evento Stripe non valido.');}
  const mode=candidate.livemode?'live':'test',secret=process.env[`PRIME_STRIPE_${mode.toUpperCase()}_WEBHOOK_SECRET`]||process.env[`STRIPE_${mode.toUpperCase()}_WEBHOOK_SECRET`]||'';if(!secret)throw new ApiError(503,'Webhook Connect non configurato sul server PRIME.');
  const p=platform(mode);let event;try{event=p.webhooks.constructEvent(body,req.headers['stripe-signature'],secret);}catch{throw new ApiError(400,'Firma Stripe non valida.');}
  const row=db.prepare('SELECT * FROM stripe_agency_accounts WHERE account_id=? AND mode=?').get(event.account,mode);if(!row)throw new ApiError(404,'Account Stripe Connect non trovato.');
  if(event.livemode!==(row.mode==='live')||event.account!==row.account_id)throw new ApiError(400,'Account o ambiente non corrispondente.');
  if(db.prepare('SELECT 1 FROM stripe_agency_events WHERE tenant_id=? AND mode=? AND event_id=?').get(row.tenant_id,row.mode,event.id)){json(res,200,{received:true});return true;}
  const object=event.data.object;
  const payment=event.type.startsWith('checkout.session.')?db.prepare('SELECT * FROM stripe_agency_payments WHERE session_id=? AND tenant_id=? AND mode=?').get(object.id,row.tenant_id,row.mode):db.prepare('SELECT * FROM stripe_agency_payments WHERE payment_intent=? AND tenant_id=? AND mode=?').get(typeof object.payment_intent==='string'?object.payment_intent:object.id,row.tenant_id,row.mode);
  if(payment)await sync(payment,client(row));
  db.prepare('INSERT OR IGNORE INTO stripe_agency_events VALUES (?,?,?,?,?)').run(row.tenant_id,row.mode,row.account_id,event.id,time());json(res,200,{received:true});return true;
 }
 async function route(req,res,url,s){
  if(!url.pathname.startsWith('/api/stripe/'))return false;
  if(demo)throw new ApiError(403,'Collega Stripe dal tuo account agenzia; la demo non salva chiavi e non crea pagamenti.');
  if(!stripeAgencyAllowed(db,s,editionFor(s)))throw new ApiError(403,'Stripe è disponibile solo nei piani Elite e Secret.');
  if(!['owner','manager'].includes(s.role))throw new ApiError(403,'Sezione riservata al titolare e ai responsabili.');
  const mode=modeOf(url),suffix=url.pathname.slice('/api/stripe'.length),method=req.method;let row=config(s.tenant_id,mode);
  if(suffix==='/status'&&method==='GET'){let linked=false;try{linked=!!row&&secrets(row).connect===true;}catch{}json(res,200,{configured:linked,mode,accountId:linked?row.account_id:null,webhookConfigured:!!(process.env[`PRIME_STRIPE_${mode.toUpperCase()}_WEBHOOK_SECRET`]||process.env[`STRIPE_${mode.toUpperCase()}_WEBHOOK_SECRET`]),webhookUrl:linked?`${publicUrl()}/api/stripe/connect/webhook`:null,canManage:s.role==='owner'});return true;}
  if(suffix==='/connect'&&method==='POST'){
   owner(s);const p=platform(mode);let linked=false;try{linked=!!row&&secrets(row).connect===true;}catch{}
   if(!linked){const account=await p.accounts.create({type:'standard',country:'IT',email:s.email,metadata:{prime_tenant_id:s.tenant_id}},{idempotencyKey:`prime-connect:${s.tenant_id}:${mode}`});
    const creds=vault.seal({connect:true},context(s.tenant_id,mode));db.prepare('INSERT INTO stripe_agency_accounts VALUES (?,?,?,?,?,?) ON CONFLICT(tenant_id,mode) DO UPDATE SET account_id=excluded.account_id,credentials_cipher=excluded.credentials_cipher,webhook_id=excluded.webhook_id,updated_at=excluded.updated_at').run(s.tenant_id,mode,account.id,creds,row?.webhook_id||randomUUID(),time());row=config(s.tenant_id,mode);audit(s,'stripe.connect_account_created',account.id);}
   const link=await createLink(row);json(res,200,{url:link.url,accountId:row.account_id});return true;
  }
  if(suffix==='/connect/refresh'&&method==='GET'){
   owner(s);if(!row)throw new ApiError(404,'Account Stripe Connect non trovato.');const link=await createLink(row);res.writeHead(303,{Location:link.url,'Cache-Control':'no-store'});res.end();return true;
  }
  if(!row)throw new ApiError(409,'Collega il tuo account Stripe per questo ambiente.');const c=client(row);
  if(suffix==='/overview'&&method==='GET'){
   const [account,balance,payouts]=await Promise.all([c.accounts.retrieve(),c.balance.retrieve(),c.payouts.list({limit:10})]);
   json(res,200,{chargesEnabled:account.charges_enabled,payoutsEnabled:account.payouts_enabled,payoutSchedule:account.settings?.payouts?.schedule?.interval||'automatic',available:balance.available.map(x=>({amount:x.amount,currency:x.currency})),pending:balance.pending.map(x=>({amount:x.amount,currency:x.currency})),payouts:payouts.data.map(x=>({id:x.id,amount:x.amount,currency:x.currency,status:x.status,arrival:x.arrival_date})),payments:db.prepare('SELECT * FROM stripe_agency_payments WHERE tenant_id=? AND mode=? ORDER BY created_at DESC LIMIT 100').all(s.tenant_id,mode).map(cleanPayment)});return true;
  }
  if(suffix==='/reports'&&method==='GET'){
   const start=Date.now()-365*86400000,series=new Map();for(let month=0;month<12;month++){const d=new Date();d.setDate(1);d.setHours(0,0,0,0);d.setMonth(d.getMonth()-month);const key=d.toISOString().slice(0,7);series.set(key,{month:key,income:0,fees:0,refunds:0,payouts:0,net:0});}
   const txs=[];for await(const tx of c.balanceTransactions.list({limit:100,created:{gte:Math.floor(start/1000)}}).autoPagingIterator()){txs.push({id:tx.id,created:tx.created,amount:tx.amount,fee:tx.fee,net:tx.net,currency:tx.currency,category:tx.reporting_category||tx.type,description:tx.description});if(txs.length>=2000)break;const key=new Date(tx.created*1000).toISOString().slice(0,7),row=series.get(key);if(!row)continue;row.net+=tx.net;row.fees+=tx.fee;if((tx.reporting_category||tx.type)==='charge')row.income+=tx.amount;if((tx.reporting_category||tx.type)==='refund')row.refunds+=Math.abs(tx.amount);if((tx.reporting_category||tx.type)==='payout')row.payouts+=Math.abs(tx.amount);}
   const invoices=await c.invoices.list({limit:100,status:'open'});json(res,200,{series:[...series.values()].sort((a,b)=>a.month.localeCompare(b.month)),transactions:txs.slice(0,250),receivables:invoices.data.map(i=>({id:i.id,number:i.number||i.id,customer:i.customer_name||i.customer_email||'',amount:i.amount_remaining,currency:i.currency,due:i.due_date,status:i.status,url:i.hosted_invoice_url})),reportCapped:txs.length>=2000});return true;
  }
  if(suffix==='/invoices'&&method==='GET'){
   const invoices=await c.invoices.list({limit:100});json(res,200,invoices.data.map(i=>({id:i.id,number:i.number||i.id,customer:i.customer_name||i.customer_email||'',amount:i.total,currency:i.currency,status:i.status,due:i.due_date,pdf:i.invoice_pdf,url:i.hosted_invoice_url,created:i.created})));return true;
  }
  if(suffix==='/invoices'&&method==='POST'){
   owner(s);const b=await readBody(req),key=identity(b),name=String(b.name||'').trim(),email=String(b.email||'').trim().toLowerCase(),description=String(b.description||'').trim();
   if(!name||name.length>120||!/^\S+@\S+\.\S+$/.test(email)||email.length>254||!description||description.length>200||!Number.isSafeInteger(b.amount)||b.amount<50||b.amount>99999999||![7,14,30,60].includes(b.daysUntilDue))throw new ApiError(400,'Completa cliente, email, descrizione, importo e scadenza.');
   let customer=(await c.customers.list({email,limit:1})).data[0];if(!customer)customer=await c.customers.create({name,email},{idempotencyKey:`prime-customer:${row.account_id}:${key}`});
   const invoiceItem=await c.invoiceItems.create({customer:customer.id,currency:'eur',amount:b.amount,description},{idempotencyKey:`prime-invoice-item:${row.account_id}:${key}`});
   let invoice=await c.invoices.create({customer:customer.id,currency:'eur',collection_method:'send_invoice',days_until_due:b.daysUntilDue,auto_advance:false,pending_invoice_items_behavior:'include',description,metadata:{prime_invoice_item:invoiceItem.id}},{idempotencyKey:`prime-invoice:${row.account_id}:${key}`});
   if(invoice.status==='draft')invoice=await c.invoices.finalizeInvoice(invoice.id,{}, {idempotencyKey:`prime-finalize:${row.account_id}:${key}`});
   if(invoice.status==='open')invoice=await c.invoices.sendInvoice(invoice.id,{}, {idempotencyKey:`prime-send:${row.account_id}:${key}`});
   audit(s,'stripe.invoice_created',invoice.id);json(res,201,{id:invoice.id,url:invoice.hosted_invoice_url,pdf:invoice.invoice_pdf,number:invoice.number,status:invoice.status,total:invoice.total,currency:invoice.currency});return true;
  }
  if(suffix==='/payouts'&&method==='POST'){
   owner(s);const b=await readBody(req),key=identity(b);if(b.confirmed!==true||!Number.isSafeInteger(b.amount)||b.amount<100)throw new ApiError(400,'Conferma un importo di almeno 1 €.');
   const account=await c.accounts.retrieve();if(account.settings?.payouts?.schedule?.interval!=='manual')throw new ApiError(409,'Imposta prima la frequenza dei payout su manuale nelle impostazioni Stripe.');
   const balance=await c.balance.retrieve(),available=balance.available.find(x=>x.currency==='eur')?.amount||0;if(b.amount>available)throw new ApiError(409,'Il saldo EUR disponibile non copre questo bonifico.');
   const payout=await c.payouts.create({amount:b.amount,currency:'eur',method:'standard',description:'Bonifico richiesto da PRIME'},{idempotencyKey:`prime-payout:${row.account_id}:${key}`});audit(s,'stripe.payout_created',payout.id);json(res,201,{id:payout.id,amount:payout.amount,currency:payout.currency,status:payout.status,arrival:payout.arrival_date});return true;
  }
  if(suffix==='/checkout'&&method==='POST'){
   owner(s);const b=await readBody(req),requestKey=identity(b),description=String(b.description||'').trim();
   if(!Number.isSafeInteger(b.amount)||b.amount<50||b.amount>99999999||!description||description.length>200)throw new ApiError(400,'Indica una descrizione e un importo valido, da 0,50 € a 999.999,99 €.');
   if(!secrets(row).webhookSecret)throw new ApiError(409,'Configura il webhook firmato prima di creare richieste di pagamento.');
   const account=await c.accounts.retrieve();if(mode==='live'&&!account.charges_enabled)throw new ApiError(409,'Stripe deve ancora abilitare gli incassi su questo account.');
   db.prepare('INSERT OR IGNORE INTO stripe_agency_payments(id,tenant_id,mode,account_id,request_key,description,amount,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)').run(randomUUID(),s.tenant_id,mode,row.account_id,requestKey,description,b.amount,time(),time());
   const payment=db.prepare('SELECT * FROM stripe_agency_payments WHERE tenant_id=? AND mode=? AND request_key=?').get(s.tenant_id,mode,requestKey);
   if(payment.amount!==b.amount||payment.description!==description)throw new ApiError(409,'Questa richiesta è già associata a un altro pagamento.');
   if(!payment.session_id){const returnUrl=`${publicUrl()}/app?stripe_payment=${payment.id}`;const session=await c.checkout.sessions.create({mode:'payment',line_items:[{price_data:{currency:'eur',unit_amount:b.amount,product_data:{name:description}},quantity:1}],metadata:{prime_payment_id:payment.id},payment_intent_data:{metadata:{prime_payment_id:payment.id}},success_url:`${returnUrl}&result=success`,cancel_url:`${returnUrl}&result=cancelled`,integration_identifier:`prime_${randomBytes(4).toString('hex')}`},{idempotencyKey:`prime:${row.account_id}:${payment.id}`});
    db.prepare('UPDATE stripe_agency_payments SET session_id=?,checkout_url=?,state=?,updated_at=? WHERE id=?').run(session.id,session.url,'pending',time(),payment.id);audit(s,'stripe.checkout_created',payment.id);}
   json(res,201,cleanPayment(db.prepare('SELECT * FROM stripe_agency_payments WHERE id=?').get(payment.id)));return true;
  }
  const paymentRoute=/^\/payments\/([a-f0-9-]{36})\/(sync|refund)$/.exec(suffix);
  if(paymentRoute&&method==='POST'){
   owner(s);const p=db.prepare('SELECT * FROM stripe_agency_payments WHERE id=? AND tenant_id=? AND mode=?').get(paymentRoute[1],s.tenant_id,mode);if(!p?.session_id)throw new ApiError(404,'Pagamento non trovato.');
   if(paymentRoute[2]==='refund'){const b=await readBody(req);identity(b);if(b.confirmed!==true)throw new ApiError(400,'Conferma il rimborso.');await sync(p,c);const current=db.prepare('SELECT * FROM stripe_agency_payments WHERE id=?').get(p.id);if(!current.payment_intent||!['paid','partially_refunded'].includes(current.state))throw new ApiError(409,'Questo pagamento non è rimborsabile.');await c.refunds.create({payment_intent:current.payment_intent},{idempotencyKey:`prime-refund:${p.id}:${b.requestKey}`});audit(s,'stripe.refund_requested',p.id);}
   await sync(p,c);json(res,200,{updated:true});return true;
  }
  if(suffix==='/issuing'||suffix.startsWith('/issuing/'))throw new ApiError(501,'Emissione carte: funzione in arrivo.');
  if(suffix==='/issuing'&&method==='GET'){
   const account=await c.accounts.retrieve();if(account.capabilities?.card_issuing!=='active'){json(res,200,{enabled:false,reason:'Stripe Issuing richiede l’attivazione e l’approvazione di Stripe per il tuo account.'});return true;}
   const [cards,holders]=await Promise.all([c.issuing.cards.list({limit:100,expand:['data.cardholder']}),c.issuing.cardholders.list({limit:100})]);
   json(res,200,{enabled:true,cards:cards.data.map(x=>({id:x.id,last4:x.last4,brand:x.brand,status:x.status,name:x.cardholder?.name||'',type:x.type})),holders:holders.data.filter(x=>x.status==='active').map(x=>({id:x.id,name:x.name}))});return true;
  }
  if(suffix==='/issuing/cardholders'&&method==='POST'){
   owner(s);const b=await readBody(req);identity(b);const account=await c.accounts.retrieve();if(account.capabilities?.card_issuing!=='active')throw new ApiError(409,'Stripe Issuing non è attivo.');
   const first=String(b.firstName||'').trim(),last=String(b.lastName||'').trim(),email=String(b.email||'').trim(),phone=String(b.phone||'').trim(),line1=String(b.line1||'').trim(),city=String(b.city||'').trim(),postal=String(b.postalCode||'').trim(),country=String(b.country||'').trim().toUpperCase();
   const cardName=`${first} ${last}`;
   if(!first||!last||first.length>80||last.length>80||Array.from(cardName).length>24||!/^\p{Script=Latin}[\p{Script=Latin} .,'-]*$/u.test(first)||!/^\p{Script=Latin}[\p{Script=Latin} .,'-]*$/u.test(last)||!/^\S+@\S+\.\S+$/.test(email)||email.length>254||!/^[+0-9() .-]{7,32}$/.test(phone)||line1.length<3||line1.length>200||!city||city.length>100||!postal||postal.length>20||!/^[A-Z]{2}$/.test(country))throw new ApiError(400,'Completa nome e cognome (massimo 24 caratteri sul nome carta), email, telefono e indirizzo di fatturazione.');
   const holder=await c.issuing.cardholders.create({type:'individual',name:cardName,email,phone_number:phone,billing:{address:{line1,city,postal_code:postal,country}},individual:{first_name:first,last_name:last},preferred_locales:['it'],metadata:{prime_agency_id:s.tenant_id}},{idempotencyKey:`prime-cardholder:${row.account_id}:${b.requestKey}`});audit(s,'stripe.cardholder_created',holder.id);json(res,201,{id:holder.id,name:holder.name,status:holder.status});return true;
  }
  if(suffix==='/issuing/cards'&&method==='POST'){
   owner(s);const b=await readBody(req);identity(b);const account=await c.accounts.retrieve();if(account.capabilities?.card_issuing!=='active')throw new ApiError(409,'Stripe Issuing non è attivo.');
   if(b.confirmed!==true||!/^ich_[A-Za-z0-9]+$/.test(b.cardholder||'')||!Number.isSafeInteger(b.monthlyLimit)||b.monthlyLimit<100||b.monthlyLimit>10000000)throw new ApiError(400,'Seleziona un titolare verificato, un limite mensile e conferma.');
   const holder=await c.issuing.cardholders.retrieve(b.cardholder);if(holder.status!=='active')throw new ApiError(409,'Completa prima la verifica del titolare in Stripe.');
   const card=await c.issuing.cards.create({cardholder:holder.id,currency:'eur',type:'virtual',status:'inactive',spending_controls:{spending_limits:[{amount:b.monthlyLimit,interval:'monthly'}]}},{idempotencyKey:`prime-card:${row.account_id}:${b.requestKey}`});audit(s,'stripe.card_created',card.id);json(res,201,{id:card.id,last4:card.last4,status:card.status});return true;
  }
  const cardRoute=/^\/issuing\/cards\/(ic_[A-Za-z0-9]+)$/.exec(suffix);
  if(cardRoute&&method==='PUT'){owner(s);const b=await readBody(req);if(b.confirmed!==true||!['active','inactive'].includes(b.status))throw new ApiError(400,'Conferma lo stato della carta.');await c.issuing.cards.update(cardRoute[1],{status:b.status});audit(s,'stripe.card_status_changed',cardRoute[1]);json(res,200,{updated:true});return true;}
  throw new ApiError(404,'Operazione Stripe non disponibile.');
 }
 return {route:async(...args)=>{try{return await route(...args);}catch(e){if(e instanceof ApiError)throw e;throw new ApiError(502,'Stripe non ha completato la richiesta. Verifica permessi della chiave e stato dell’account; riprova con la stessa richiesta.');}},publicRoute};
}
