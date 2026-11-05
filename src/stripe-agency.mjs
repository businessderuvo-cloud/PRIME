import Stripe from 'stripe';
import {createHash,randomUUID,randomBytes} from 'node:crypto';
import {ApiError} from './validation.mjs';
import {rawBody} from './connect/store.mjs';

export function stripeAgencyAllowed(db,s,edition,now=new Date().toISOString()) {
 const paid=db.prepare("SELECT plan FROM plan_subscriptions WHERE tenant_id=? AND state='active' AND period_end>? ORDER BY revision DESC LIMIT 1").get(s.tenant_id,now);
 return paid ? ['elite','secret'].includes(paid.plan) : ['elite','secret'].includes(edition);
}
export function stripeAgencyService({db,vault,json,readBody,audit,editionFor,publicUrl,demo=false,fetcher=globalThis.fetch,clientFactory=(key,options={})=>new Stripe(key,{apiVersion:'2026-09-30.endive',maxNetworkRetries:1,timeout:20000,...options})}) {
 const context=(tenant,mode)=>`stripe-agency:${tenant}:${mode}`;
 const config=(tenant,mode)=>db.prepare('SELECT * FROM stripe_agency_accounts WHERE tenant_id=? AND mode=?').get(tenant,mode);
 const platformKey=mode=>process.env[`PRIME_STRIPE_${mode.toUpperCase()}_SECRET_KEY`]||process.env[`STRIPE_${mode.toUpperCase()}_SECRET_KEY`]||'';
 const connectClientId=mode=>process.env[`PRIME_STRIPE_${mode.toUpperCase()}_CONNECT_CLIENT_ID`]||process.env[`STRIPE_${mode.toUpperCase()}_CONNECT_CLIENT_ID`]||'';
 const connectConfigured=mode=>platformKey(mode).startsWith(`sk_${mode}_`)&&/^ca_[A-Za-z0-9]+$/.test(connectClientId(mode));
 const webhookSecret=mode=>process.env[`PRIME_STRIPE_${mode.toUpperCase()}_WEBHOOK_SECRET`]||process.env[`STRIPE_${mode.toUpperCase()}_WEBHOOK_SECRET`]||'';
 const platform=mode=>{const key=platformKey(mode);if(!key.startsWith(`sk_${mode}_`))throw new ApiError(503,`Stripe Connect ${mode==='test'?'Test':'Live'} non è configurato sul server PRIME.`);return clientFactory(key);};
 const secrets=row=>vault.open(row.credentials_cipher,context(row.tenant_id,row.mode));
 const client=row=>clientFactory(platformKey(row.mode),{stripeAccount:row.account_id});
 const createLink=async(row)=>platform(row.mode).accountLinks.create({account:row.account_id,refresh_url:`${publicUrl()}/api/stripe/connect/refresh?mode=${row.mode}`,return_url:`${publicUrl()}/app?stripe_connect=complete`,type:'account_onboarding'});
 const owner=s=>{if(s.role!=='owner')throw new ApiError(403,'Operazione riservata al titolare.');};
 const time=()=>new Date().toISOString();
 const stateHash=value=>createHash('sha256').update(value).digest('hex');
 const callbackPath=demo?'/demo/api/stripe/connect/callback':'/api/stripe/connect/callback';
 const callbackUrl=mode=>{if(!connectConfigured(mode))throw new ApiError(503,`Configura il Client ID OAuth Connect e la chiave ${mode==='test'?'Test':'Live'} di Stripe sul server PRIME.`);const url=new URL(callbackPath,publicUrl());if(mode==='live'&&url.protocol!=='https:')throw new ApiError(503,'Il collegamento Stripe Live richiede un URL di ritorno HTTPS.');return url.toString();};
 async function authorizeExisting(s,mode){
  const redirectUri=callbackUrl(mode),state=randomBytes(32).toString('hex'),createdAt=time(),expiresAt=new Date(Date.now()+10*60*1000).toISOString();
  db.prepare('DELETE FROM stripe_agency_oauth_states WHERE expires_at<=?').run(createdAt);
  db.prepare('INSERT INTO stripe_agency_oauth_states(state_hash,tenant_id,user_id,mode,created_at,expires_at) VALUES (?,?,?,?,?,?)').run(stateHash(state),s.tenant_id,s.user_id,mode,createdAt,expiresAt);
  const authorizeUrl=new URL('https://connect.stripe.com/oauth/authorize');authorizeUrl.searchParams.set('response_type','code');authorizeUrl.searchParams.set('client_id',connectClientId(mode));authorizeUrl.searchParams.set('scope','read_write');authorizeUrl.searchParams.set('redirect_uri',redirectUri);authorizeUrl.searchParams.set('state',state);
  return authorizeUrl.toString();
 }
 async function exchangeAuthorizationCode(mode,code){
  const key=platformKey(mode);let response,payload;
  try{response=await fetcher('https://connect.stripe.com/oauth/token',{method:'POST',headers:{Authorization:`Basic ${Buffer.from(`${key}:`).toString('base64')}`,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',code}),signal:AbortSignal.timeout(20000)});payload=await response.json();}catch{throw new ApiError(502,'Stripe non ha completato il collegamento. Avviane uno nuovo da PRIME.');}
  if(!response.ok||!payload?.stripe_user_id)throw new ApiError(502,'Stripe non ha completato il collegamento. Avviane uno nuovo da PRIME.');
  return payload;
 }
 const modeOf=url=>{const mode=url.searchParams.get('mode')||'test';if(!['test','live'].includes(mode))throw new ApiError(400,'Ambiente non valido.');return mode;};
 const linked=row=>{try{return !!row&&secrets(row).connect===true;}catch{return false;}};
 const cleanLink=link=>({id:link.id,url:link.url,active:link.active,description:link.metadata?.prime_description||'',amount:Number(link.metadata?.prime_amount)||null,currency:link.currency||'eur'});
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
  const mode=candidate.livemode?'live':'test',secret=webhookSecret(mode);if(!secret)throw new ApiError(503,'Webhook Connect non configurato sul server PRIME.');
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
  if(!stripeAgencyAllowed(db,s,editionFor(s)))throw new ApiError(403,'Stripe è disponibile solo nei piani Elite e Secret.');
  if(!['owner','manager'].includes(s.role))throw new ApiError(403,'Sezione riservata al titolare e ai responsabili.');
  const suffix=url.pathname.slice('/api/stripe'.length),method=req.method;
  if(demo&&!((method==='POST'&&suffix==='/connect')||(method==='GET'&&['/status','/connect/callback','/overview','/reports','/invoices','/payment-links','/issuing'].includes(suffix))))throw new ApiError(403,'La demo Stripe è in sola lettura.');
  if(suffix==='/connect/callback'&&method==='GET'){
   owner(s);const state=url.searchParams.get('state')||'';if(!/^[a-f0-9]{64}$/.test(state))throw new ApiError(400,'Richiesta di collegamento Stripe non valida.');
   const stateDigest=stateHash(state),pending=db.prepare('SELECT * FROM stripe_agency_oauth_states WHERE state_hash=? AND tenant_id=? AND user_id=?').get(stateDigest,s.tenant_id,s.user_id),now=time();
   if(!pending||pending.expires_at<=now||!['test','live'].includes(pending.mode))throw new ApiError(400,'La richiesta Stripe è scaduta. Avvia un nuovo collegamento da PRIME.');if(pending.mode==='live'&&editionFor(s)!=='secret')throw new ApiError(403,'Stripe Live è disponibile solo nel piano Secret.');
   const claimed=db.prepare('DELETE FROM stripe_agency_oauth_states WHERE state_hash=? AND tenant_id=? AND user_id=? AND mode=? AND expires_at>?').run(stateDigest,s.tenant_id,s.user_id,pending.mode,now);if(!claimed.changes)throw new ApiError(400,'La richiesta Stripe è già stata usata. Avvia un nuovo collegamento da PRIME.');
   const finish=outcome=>{res.writeHead(303,{Location:`${publicUrl()}${demo?'/demo/':'/app'}?stripe_connect=${outcome}&stripe_mode=${pending.mode}`,'Cache-Control':'no-store'});res.end();return true;};
   if(url.searchParams.has('error'))return finish('cancelled');
   const code=url.searchParams.get('code')||'';if(!code||code.length>1024)throw new ApiError(400,'Stripe non ha restituito un codice valido. Avvia un nuovo collegamento da PRIME.');
   const grant=await exchangeAuthorizationCode(pending.mode,code),accountId=grant.stripe_user_id;
   if(grant.scope!=='read_write'||grant.livemode!==(pending.mode==='live')||!/^acct_[A-Za-z0-9]+$/.test(accountId||''))throw new ApiError(400,'L’account Stripe o l’ambiente non corrispondono alla richiesta.');
   const account=await platform(pending.mode).accounts.retrieve(accountId);if(account.id!==accountId)throw new ApiError(400,'Stripe non ha verificato l’account collegato.');
   const otherTenant=db.prepare('SELECT tenant_id FROM stripe_agency_accounts WHERE mode=? AND account_id=? AND tenant_id<>?').get(pending.mode,accountId,s.tenant_id);if(otherTenant)throw new ApiError(409,'Questo account Stripe è già collegato a un’altra agenzia PRIME.');
   const existing=config(s.tenant_id,pending.mode),credentials=vault.seal({connect:true,oauth:true},context(s.tenant_id,pending.mode));
   db.prepare('INSERT INTO stripe_agency_accounts VALUES (?,?,?,?,?,?) ON CONFLICT(tenant_id,mode) DO UPDATE SET account_id=excluded.account_id,credentials_cipher=excluded.credentials_cipher,webhook_id=excluded.webhook_id,updated_at=excluded.updated_at').run(s.tenant_id,pending.mode,accountId,credentials,existing?.webhook_id||randomUUID(),time());
   audit(s,'stripe.connected_account_authorized',accountId);return finish('complete');
  }
  const mode=modeOf(url);if(mode==='live'&&editionFor(s)!=='secret')throw new ApiError(403,'Stripe Live è disponibile solo nel piano Secret.');const row=config(s.tenant_id,mode);
  if(suffix==='/status'&&method==='GET'){
   const connected=linked(row);
   let callbackConfigured=false;try{const origin=new URL(publicUrl());callbackConfigured=mode!=='live'||origin.protocol==='https:';}catch{}
   const configured=connectConfigured(mode)&&callbackConfigured;
   json(res,200,{configured:connected,mode,accountId:connected?row.account_id:null,platformConfigured:configured,callbackConfigured,webhookConfigured:!demo&&!!webhookSecret(mode),webhookUrl:!demo&&connected?`${publicUrl()}/api/stripe/connect/webhook`:null,canManage:s.role==='owner',demoReadOnly:demo});return true;
  }
  if(suffix==='/connect'&&method==='POST'){
   owner(s);
   if(linked(row))throw new ApiError(409,'L’account Stripe è già collegato. Apri il Dashboard Stripe per gestirlo.');
   json(res,200,{url:await authorizeExisting(s,mode)});return true;
  }
  if(suffix==='/connect/refresh'&&method==='GET'){
   owner(s);if(!row)throw new ApiError(404,'Account Stripe Connect non trovato.');const link=await createLink(row);res.writeHead(303,{Location:link.url,'Cache-Control':'no-store'});res.end();return true;
  }
  if(!linked(row))throw new ApiError(409,'Collega il tuo account Stripe per questo ambiente.');
  platform(mode);
  const c=client(row);
  async function requireCharges(){
   if(mode!=='live')return;
   const account=await c.accounts.retrieve();
   if(!account.charges_enabled||(account.capabilities?.card_payments&&account.capabilities.card_payments!=='active'))throw new ApiError(409,'Completa la verifica degli incassi nel Dashboard Stripe.');
  }
  if(suffix==='/overview'&&method==='GET'){
   const [account,balance,payouts]=await Promise.all([c.accounts.retrieve(),c.balance.retrieve(),c.payouts.list({limit:10})]);
   json(res,200,{chargesEnabled:account.charges_enabled,payoutsEnabled:account.payouts_enabled,payoutSchedule:account.settings?.payouts?.schedule?.interval||'automatic',available:balance.available.map(x=>({amount:x.amount,currency:x.currency})),pending:balance.pending.map(x=>({amount:x.amount,currency:x.currency})),payouts:payouts.data.map(x=>({id:x.id,amount:x.amount,currency:x.currency,status:x.status,arrival:x.arrival_date})),payments:db.prepare('SELECT * FROM stripe_agency_payments WHERE tenant_id=? AND mode=? AND account_id=? ORDER BY created_at DESC LIMIT 100').all(s.tenant_id,mode,row.account_id).map(cleanPayment)});return true;
  }
  if(suffix==='/reports'&&method==='GET'){
   const now=new Date();
   const first=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()-11,1));
   const months=Array.from({length:12},(_,i)=>new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+i,1)).toISOString().slice(0,7));
   const emptySeries=()=>Object.fromEntries(months.map(month=>[month,{month,income:0,pending:0,fees:0,refunds:0,payouts:0,net:0}]));
   const grouped=new Map(),transactions=[];let count=0,reportCapped=false;
   for await(const tx of c.balanceTransactions.list({limit:100,created:{gte:Math.floor(first.getTime()/1000)}})){
    if(count++>=2000){reportCapped=true;break;}
    const category=tx.reporting_category||tx.type,currency=tx.currency,month=new Date(tx.created*1000).toISOString().slice(0,7);
    if(!grouped.has(currency))grouped.set(currency,emptySeries());
    const totals=grouped.get(currency)[month];
    if(!totals)continue;
    totals.net+=tx.net;totals.fees+=tx.fee;
    if(['charge','payment'].includes(category)){totals.income+=tx.amount;if(tx.status==='pending')totals.pending+=Math.max(0,tx.net);}
    if(['refund','payment_refund'].includes(category))totals.refunds+=Math.abs(tx.amount);
    if(category==='payout')totals.payouts+=Math.abs(tx.amount);
    if(transactions.length<250)transactions.push({id:tx.id,created:tx.created,amount:tx.amount,fee:tx.fee,net:tx.net,currency,status:tx.status,category,description:tx.description});
   }
   if(!grouped.size)grouped.set('eur',emptySeries());
   const seriesByCurrency=Object.fromEntries([...grouped].map(([currency,totals])=>[currency,Object.values(totals)]));
   json(res,200,{seriesByCurrency,series:seriesByCurrency.eur||Object.values(seriesByCurrency)[0],transactions,reportCapped});return true;
  }
  if(suffix==='/invoices'&&method==='GET'){
   const invoices=await c.invoices.list({limit:100});json(res,200,invoices.data.map(i=>({id:i.id,number:i.number||i.id,customer:i.customer_name||i.customer_email||'',amount:i.total,remaining:i.amount_remaining,currency:i.currency,status:i.status,due:i.due_date,pdf:i.invoice_pdf,url:i.hosted_invoice_url,created:i.created})));return true;
  }
  if(suffix==='/invoices'&&method==='POST'){
   owner(s);const b=await readBody(req),key=identity(b),name=String(b.name||'').trim(),email=String(b.email||'').trim().toLowerCase(),description=String(b.description||'').trim();
   if(!name||name.length>120||!/^\S+@\S+\.\S+$/.test(email)||email.length>254||!description||description.length>200||!Number.isSafeInteger(b.amount)||b.amount<50||b.amount>99999999||![7,14,30,60].includes(b.daysUntilDue))throw new ApiError(400,'Completa cliente, email, descrizione, importo e scadenza.');
   await requireCharges();
   let customer=(await c.customers.list({email,limit:1})).data[0];if(!customer)customer=await c.customers.create({name,email},{idempotencyKey:`prime-customer:${row.account_id}:${key}`});
   let invoice=await c.invoices.create({customer:customer.id,currency:'eur',collection_method:'send_invoice',days_until_due:b.daysUntilDue,auto_advance:false,pending_invoice_items_behavior:'exclude',description},{idempotencyKey:`prime-invoice-v2:${row.account_id}:${key}`});
   await c.invoiceItems.create({customer:customer.id,invoice:invoice.id,currency:'eur',amount:b.amount,description},{idempotencyKey:`prime-invoice-line-v2:${row.account_id}:${key}`});
   if(b.send===true){
    if(invoice.status==='draft')invoice=await c.invoices.finalizeInvoice(invoice.id,{}, {idempotencyKey:`prime-finalize:${row.account_id}:${key}`});
    if(invoice.status==='open')invoice=await c.invoices.sendInvoice(invoice.id,{}, {idempotencyKey:`prime-send:${row.account_id}:${key}`});
   }
   if(b.send!==true)invoice=await c.invoices.retrieve(invoice.id);
   if(b.send!==true)invoice=await c.invoices.retrieve(invoice.id);
   audit(s,'stripe.invoice_created',invoice.id);json(res,201,{id:invoice.id,url:invoice.hosted_invoice_url,pdf:invoice.invoice_pdf,number:invoice.number,status:invoice.status,total:invoice.total,currency:invoice.currency});return true;
  }
  const invoiceAction=/^\/invoices\/(in_[A-Za-z0-9]+)\/(send|void)$/.exec(suffix);
  if(invoiceAction&&method==='POST'){
   owner(s);const b=await readBody(req),key=identity(b),[,id,action]=invoiceAction;
   if(b.confirmed!==true)throw new ApiError(400,'Conferma l’operazione sulla fattura.');
   let invoice=await c.invoices.retrieve(id);
   if(action==='send'){
    await requireCharges();
    if(invoice.collection_method!=='send_invoice'||!['draft','open'].includes(invoice.status))throw new ApiError(409,'La fattura non può essere inviata in questo stato.');
    if(invoice.status==='draft')invoice=await c.invoices.finalizeInvoice(id,{}, {idempotencyKey:`prime-invoice-finalize:${id}:${key}`});
    if(invoice.status!=='open')throw new ApiError(409,'La fattura non è aperta.');
    invoice=await c.invoices.sendInvoice(id,{}, {idempotencyKey:`prime-invoice-send:${id}:${key}`});
   }else{
    if(!['open','uncollectible'].includes(invoice.status))throw new ApiError(409,'La fattura non può essere annullata in questo stato.');
    invoice=await c.invoices.voidInvoice(id,{}, {idempotencyKey:`prime-invoice-void:${id}:${key}`});
   }
   audit(s,'stripe.invoice_'+action,id);json(res,200,{id,status:invoice.status});return true;
  }
  if(suffix==='/payment-links'&&method==='GET'){
   const links=await c.paymentLinks.list({limit:50});json(res,200,links.data.map(cleanLink));return true;
  }
  if(suffix==='/payment-links'&&method==='POST'){
   owner(s);const b=await readBody(req),key=identity(b),description=String(b.description||'').trim();
   if(!description||description.length>200||!Number.isSafeInteger(b.amount)||b.amount<50||b.amount>99999999)throw new ApiError(400,'Indica una descrizione e un importo valido da 0,50 € a 999.999,99 €.');
   await requireCharges();
   const price=await c.prices.create({currency:'eur',unit_amount:b.amount,product_data:{name:description}},{idempotencyKey:`prime-link-price:${row.account_id}:${key}`});
   const link=await c.paymentLinks.create({line_items:[{price:price.id,quantity:1}],restrictions:{completed_sessions:{limit:1}},metadata:{prime_description:description,prime_amount:String(b.amount)}},{idempotencyKey:`prime-link:${row.account_id}:${key}`});
   audit(s,'stripe.payment_link_created',link.id);json(res,201,cleanLink(link));return true;
  }
  const linkAction=/^\/payment-links\/(plink_[A-Za-z0-9]+)$/.exec(suffix);
  if(linkAction&&method==='PUT'){
   owner(s);const b=await readBody(req),key=identity(b);
   if(typeof b.active!=='boolean'||b.confirmed!==true)throw new ApiError(400,'Conferma lo stato del link.');
   if(b.active)await requireCharges();
   const link=await c.paymentLinks.update(linkAction[1],{active:b.active},{idempotencyKey:`prime-link-status:${linkAction[1]}:${key}`});
   audit(s,'stripe.payment_link_updated',link.id);json(res,200,cleanLink(link));return true;
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
   const account=await c.accounts.retrieve();if(mode==='live'&&!account.charges_enabled)throw new ApiError(409,'Stripe deve ancora abilitare gli incassi su questo account.');
   db.prepare('INSERT OR IGNORE INTO stripe_agency_payments(id,tenant_id,mode,account_id,request_key,description,amount,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)').run(randomUUID(),s.tenant_id,mode,row.account_id,requestKey,description,b.amount,time(),time());
   const payment=db.prepare('SELECT * FROM stripe_agency_payments WHERE tenant_id=? AND mode=? AND request_key=?').get(s.tenant_id,mode,requestKey);
   if(payment.account_id!==row.account_id||payment.amount!==b.amount||payment.description!==description)throw new ApiError(409,'Questa richiesta è già associata a un altro pagamento.');
   if(!payment.session_id){const returnUrl=`${publicUrl()}/app?stripe_payment=${payment.id}`;const session=await c.checkout.sessions.create({mode:'payment',line_items:[{price_data:{currency:'eur',unit_amount:b.amount,product_data:{name:description}},quantity:1}],metadata:{prime_payment_id:payment.id},payment_intent_data:{metadata:{prime_payment_id:payment.id}},success_url:`${returnUrl}&result=success`,cancel_url:`${returnUrl}&result=cancelled`,integration_identifier:`prime_${stateHash(payment.id).slice(0,8)}`},{idempotencyKey:`prime:${row.account_id}:${payment.id}`});
    db.prepare('UPDATE stripe_agency_payments SET session_id=?,checkout_url=?,state=?,updated_at=? WHERE id=?').run(session.id,session.url,'pending',time(),payment.id);audit(s,'stripe.checkout_created',payment.id);}
   json(res,201,cleanPayment(db.prepare('SELECT * FROM stripe_agency_payments WHERE id=?').get(payment.id)));return true;
  }
  const paymentRoute=/^\/payments\/([a-f0-9-]{36})\/(sync|refund)$/.exec(suffix);
  if(paymentRoute&&method==='POST'){
   owner(s);const p=db.prepare('SELECT * FROM stripe_agency_payments WHERE id=? AND tenant_id=? AND mode=? AND account_id=?').get(paymentRoute[1],s.tenant_id,mode,row.account_id);if(!p?.session_id)throw new ApiError(404,'Pagamento non trovato.');
   if(paymentRoute[2]==='refund'){const b=await readBody(req);identity(b);if(b.confirmed!==true)throw new ApiError(400,'Conferma il rimborso.');await sync(p,c);const current=db.prepare('SELECT * FROM stripe_agency_payments WHERE id=?').get(p.id);if(!current.payment_intent||!['paid','partially_refunded'].includes(current.state))throw new ApiError(409,'Questo pagamento non è rimborsabile.');await c.refunds.create({payment_intent:current.payment_intent},{idempotencyKey:`prime-refund:${p.id}:${b.requestKey}`});audit(s,'stripe.refund_requested',p.id);}
   await sync(p,c);json(res,200,{updated:true});return true;
  }
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
