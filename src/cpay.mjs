import {randomUUID} from 'node:crypto';
import {plans} from '../public/pricing.js';
import {transaction} from './database.mjs';
import {ApiError} from './validation.mjs';
import {nativeCheckout} from './cpay-checkout.mjs';
import {checkoutKybAccess,checkoutOrderKybAccess} from './billing-kyb.mjs';

export const cryptoCents=(plan,cycle)=>Math.round(plans[plan].monthly*100*(cycle==='annual'?9:1));

export function reviewDiscount(db,tenant,plan,cycle,cents){
 if(cycle!=='monthly')return 0;
 const reward=db.prepare("SELECT * FROM trustpilot_rewards WHERE tenant_id=? AND cycle='monthly' AND status='approved' AND automation_state='pending'").get(tenant);
 if(!reward)return 0;
 const paid=db.prepare("SELECT * FROM cpay_orders WHERE tenant_id=? AND state='paid' ORDER BY paid_at,id").all(tenant);
 if(paid.length!==1||paid[0].cycle!=='monthly'||paid[0].plan!==plan||reward.payment_reference!=='cpay:'+paid[0].charge_id)return 0;
 return Math.min(cents,Math.round(cents*7/100));
}

const currencies=['5edf2767c9ca4d5a342bf8ac','6336da3bca5405284b73d9ae','647c3c108268113f59a7197e','6867e8d06b6b4ec18c2a0d84','653621140b4afe0330d6bfff'];
export function cpayService({db,json,readBody,env=process.env,fetcher=fetch,clock=Date.now}){
 const configured=()=>!!(env.PRIME_CPAY_PUBLIC_KEY&&env.PRIME_CPAY_PRIVATE_KEY&&env.PRIME_CPAY_MERCHANT_ID);
 let token='',tokenUntil=0,busy=false;const locks=new Set();
 async function request(path,body,authenticated=true,methodOverride){
  if(authenticated&&clock()>=tokenUntil){
   const auth=await request('/api/public/auth',{publicKey:env.PRIME_CPAY_PUBLIC_KEY,privateKey:env.PRIME_CPAY_PRIVATE_KEY},false);
   token=auth.token||auth.data?.token;if(!token)throw new ApiError(503,'Accesso CPAY non disponibile.');tokenUntil=clock()+15*60000;
  }
  let response;try{response=await fetcher('https://api.cpay.world'+path,{method:methodOverride||(body?'POST':'GET'),headers:{'Content-Type':'application/json',...(authenticated?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000),redirect:'error'});}catch{throw new ApiError(503,'CPAY non raggiungibile. Riprova tra poco.');}
  if(response.status===401){tokenUntil=0;throw new ApiError(503,'Accesso CPAY da aggiornare.');}
  if(!response.ok)throw new ApiError(503,'CPAY non ha completato la richiesta. Nessun abbonamento attivato.');
  let data={};if(response.status!==204){try{data=await response.json();}catch{if((methodOverride||(body?'POST':'GET'))!=='DELETE')throw new ApiError(503,'Risposta CPAY non valida.');}}
  if(data.status==='fail')throw new ApiError(503,'Richiesta CPAY non riuscita.');return data;
 }
 function activate(order,chargeId){return transaction(db,()=>{
  if(db.prepare('SELECT state FROM cpay_orders WHERE id=?').get(order.id)?.state==='paid')return;
  if(!checkoutOrderKybAccess(db,order,env).allowed)return;
  const now=clock(),old=db.prepare('SELECT * FROM plan_subscriptions WHERE tenant_id=?').get(order.tenant_id);
  if(old&&old.state==='active'&&Date.parse(old.period_end)>now&&old.plan!==order.plan)throw new ApiError(409,'Il cambio piano richiede un upgrade.');
  const start=old?.state==='active'&&Date.parse(old.period_end)>now?new Date(old.period_end):new Date(now);
  const end=new Date(start);const day=start.getUTCDate();end.setUTCDate(1);end.setUTCMonth(end.getUTCMonth()+(order.cycle==='annual'?12:1));const last=new Date(Date.UTC(end.getUTCFullYear(),end.getUTCMonth()+1,0)).getUTCDate();end.setUTCDate(Math.min(day,last));
  // A renewal extends access now but advances the usage anchor only at expiry.
  const periodStart=old?.state==='active'&&Date.parse(old.period_end)>now?old.period_start:start.toISOString();
  db.prepare("INSERT INTO plan_subscriptions VALUES (?,?,?,?,?,?,?,1,'active') ON CONFLICT(tenant_id) DO UPDATE SET plan=excluded.plan,cycle=excluded.cycle,period_start=excluded.period_start,period_end=excluded.period_end,paid_plan_cents=excluded.paid_plan_cents,payment_reference=excluded.payment_reference,revision=plan_subscriptions.revision+1,state='active'").run(order.tenant_id,order.plan,order.cycle,periodStart,end.toISOString(),order.cents,'cpay:'+chargeId);
  if(['vip','elite'].includes(order.plan))db.prepare("INSERT INTO ai_subscriptions VALUES (?,?,?,?,'active') ON CONFLICT(tenant_id) DO UPDATE SET plan=excluded.plan,billing_anchor=excluded.billing_anchor,billing_cycle=excluded.billing_cycle,state='active'").run(order.tenant_id,order.plan,periodStart,order.cycle);
  else db.prepare("UPDATE ai_subscriptions SET state='suspended' WHERE tenant_id=?").run(order.tenant_id);
  db.prepare("UPDATE cpay_orders SET state='paid',charge_id=?,paid_at=? WHERE id=?").run(chargeId,new Date(now).toISOString(),order.id);
  const settled=db.prepare('SELECT reward_discount_cents FROM cpay_orders WHERE id=?').get(order.id);
  if(settled?.reward_discount_cents>0)db.prepare("UPDATE trustpilot_rewards SET status='fulfilled',amount_cents=?,fulfillment_reference=?,fulfilled_at=? WHERE tenant_id=? AND cycle='monthly' AND status='approved'").run(settled.reward_discount_cents,'cpay:'+chargeId,new Date(now).toISOString(),order.tenant_id);
 });}
 async function reconcile(order){
  db.prepare('UPDATE cpay_orders SET checked_at=? WHERE id=?').run(clock(),order.id);
  const checkout=(await request('/api/public/checkout/'+encodeURIComponent(order.checkout_id))).data;
  const merchant=typeof checkout?.merchant==='object'?(checkout.merchant._id||checkout.merchant.id):checkout?.merchant;
  if(merchant!==env.PRIME_CPAY_MERCHANT_ID||checkout.identifier!==order.identifier||checkout.type!=='Sale'||checkout.fiatCurrency!=='EUR'||Math.round(Number(checkout.price)*100)!==order.cents)throw new ApiError(409,'Configurazione checkout non corrispondente all’ordine.');
  for(let page=1;page<=10;page++){
   const list=(await request(`/api/public/checkout/${encodeURIComponent(order.checkout_id)}/charge-list?page=${page}&order=DESC`)).data;
   for(const charge of list?.entities||[]){
    const chargeId=charge.id||charge._id;if(charge.systemStatus!=='Done'||typeof chargeId!=='string')continue;
    const detail=(await request('/api/checkout-client/'+encodeURIComponent(chargeId)+'/charge',undefined,false)).data;
    if(detail?.systemStatus==='Done'&&detail.typeNetwork==='mainnet'&&detail.checkout?.identifier===order.identifier){activate(order,chargeId);return;}
   }
   if(!list?.pages||page>=list.pages)break;
  }
 }
 async function poll(){if(busy||!configured())return;busy=true;try{for(const order of db.prepare("SELECT * FROM cpay_orders WHERE state='pending' AND checked_at<? ORDER BY checked_at LIMIT 10").all(clock()-30000)){try{await reconcile(order);}catch{/* Keep pending; never infer success from a network failure. */}}}finally{busy=false;}}
 async function createSale(order){
  const plan=plans[order.plan],created=(await request('/api/public/checkout/sale',{productName:`PRIME ${plan.name} - ${order.cycle==='annual'?'Annuale':'Mensile'} crypto`,description:(order.cycle==='annual'?'3 MESI GRATIS: 2 di base + 1 extra con BTC o USDC. Prezzo finale già scontato. ':'Piano mensile al prezzo di listino. ')+'Rinnovo manuale. Ordine '+order.id,price:(order.cents/100).toFixed(2),fiatCurrency:'EUR',currencies,expireTime:60,collectName:'false',collectEmail:'false',hideRetry:'true',walletVersion:'v2',backgroundColor:'#101820',accentColor:'#647f96',linkLogoImage:new URL('/assets/prime-wordmark.svg',env.PRIME_PUBLIC_URL).href,linkSite:new URL('/?payment='+order.id,env.PRIME_PUBLIC_URL).href})).data;
  const checkoutId=created?._id||created?.id;
  if(!/^[a-f0-9]{24}$/.test(checkoutId||'')||!/^[-a-f0-9]{36}$/.test(created?.identifier||''))throw new ApiError(503,'Risposta CPAY incompleta: contatta l’assistenza prima di riprovare.');
  return {checkout_id:checkoutId,identifier:created.identifier};
 }
 async function replaceCheckout(order){
  const fresh=await createSale(order),oldPath='/api/public/checkout/'+encodeURIComponent(order.checkout_id),newPath='/api/public/checkout/'+encodeURIComponent(fresh.checkout_id);
  try{await request(oldPath,undefined,true,'DELETE');}catch(error){try{await request(newPath,undefined,true,'DELETE');}catch{}throw error;}
  return fresh;
 }
 async function assertUnpaidCheckout(order){
  await reconcile(order);const current=db.prepare('SELECT * FROM cpay_orders WHERE id=?').get(order.id);
  if(current?.state==='paid')throw new ApiError(409,'Pagamento già ricevuto: il checkout aperto non può essere sostituito.');
  const list=(await request(`/api/public/checkout/${encodeURIComponent(order.checkout_id)}/charge-list?page=1&order=DESC`)).data;
  if((list?.entities||[]).some(charge=>!['New','Expired'].includes(charge.systemStatus)))throw new ApiError(409,'CPAY ha già rilevato un pagamento o una verifica in corso. Completa o verifica il checkout aperto prima di cambiarlo.');
  if(current?.active_charge_id){const detail=(await request('/api/checkout-client/'+encodeURIComponent(current.active_charge_id)+'/charge',undefined,false)).data;if(!['New','Expired'].includes(detail?.systemStatus))throw new ApiError(409,'CPAY ha già rilevato un pagamento o una verifica in corso. Completa o verifica il checkout aperto prima di cambiarlo.');}
 }
 const checkoutRoute=nativeCheckout({db,json,readBody,request,reconcile,replaceCheckout,env,clock});
 async function route(req,res,url,s){
  if(!configured())return false;
  if(await checkoutRoute(req,res,url,s))return true;
  if(url.pathname==='/api/billing/payments'&&req.method==='GET'){
   if(s.role!=='owner')throw new ApiError(403,'Solo il titolare può verificare i pagamenti.');
   await poll();json(res,200,{payments:db.prepare('SELECT id,plan,cycle,cents,state,paid_at AS paidAt FROM cpay_orders WHERE tenant_id=? ORDER BY created_at DESC LIMIT 10').all(s.tenant_id)});return true;
  }
  if(url.pathname!=='/api/billing/checkout'||req.method!=='POST')return false;
  if(s.role!=='owner')throw new ApiError(403,'Solo il titolare può acquistare il piano.');
  if(!checkoutKybAccess(db,{tenantId:s.tenant_id,userId:s.user_id,env}).allowed)throw new ApiError(403,'Completa la verifica aziendale prima del pagamento.');
  const b=await readBody(req),plan=Object.hasOwn(plans,b.plan)?plans[b.plan]:null;
  if(!plan||!['monthly','annual'].includes(b.cycle))throw new ApiError(400,'Piano o ciclo non valido.');
  if(b.method&&b.method!=='crypto')throw new ApiError(503,'Il pagamento con carta non è ancora disponibile.');
  const quantity=b[plan.ai?'ai':'humans'];if(!Number.isSafeInteger(quantity)||quantity<1||quantity>(plan.ai||plan.humans))throw new ApiError(409,'Gli agenti aggiuntivi richiedono un’offerta dedicata.');
  if(locks.has(s.tenant_id))throw new ApiError(409,'Preparazione pagamento in corso.');locks.add(s.tenant_id);
  try{
   const active=db.prepare('SELECT * FROM plan_subscriptions WHERE tenant_id=?').get(s.tenant_id);
   if(active?.state==='active'&&Date.parse(active.period_end)>clock())throw new ApiError(409,'Il piano è già attivo. Il rinnovo manuale sarà disponibile alla scadenza; per cambiare piano usa Piano e upgrade.');
   // A process restart or failed CPAY request can strand a local `creating` row
   // before CPAY ever returned a checkout ID. It is not a cart or payable order.
   db.prepare("UPDATE cpay_orders SET state='expired' WHERE tenant_id=? AND state='creating' AND checkout_id IS NULL AND identifier IS NULL").run(s.tenant_id);
   const existing=db.prepare("SELECT * FROM cpay_orders WHERE tenant_id=? AND state IN ('creating','pending') ORDER BY created_at DESC LIMIT 1").get(s.tenant_id);
   if(existing){
    if(existing.state!=='pending'||!existing.identifier||!existing.checkout_id)throw new ApiError(409,'La richiesta crypto è ancora in preparazione. Riprova tra poco.');
    const wantedDiscount=reviewDiscount(db,s.tenant_id,b.plan,b.cycle,cryptoCents(b.plan,b.cycle));
    if(existing.plan!==b.plan||existing.cycle!==b.cycle||existing.reward_discount_cents!==wantedDiscount){
     await assertUnpaidCheckout(existing);const next={...existing,plan:b.plan,cycle:b.cycle,cents:cryptoCents(b.plan,b.cycle)-wantedDiscount},fresh=await replaceCheckout(next);
     db.prepare("UPDATE cpay_orders SET plan=?,cycle=?,cents=?,reward_discount_cents=?,checkout_id=?,identifier=?,state='pending',charge_id=NULL,active_charge_id=NULL,active_currency_id=NULL,checked_at=0 WHERE id=? AND state='pending'").run(next.plan,next.cycle,next.cents,wantedDiscount,fresh.checkout_id,fresh.identifier,existing.id);
    }
    json(res,200,{url:'/checkout?order='+existing.id,orderId:existing.id,method:'crypto'});return true;
   }
   const id=randomUUID(),listCents=cryptoCents(b.plan,b.cycle),discount=reviewDiscount(db,s.tenant_id,b.plan,b.cycle,listCents),cents=listCents-discount;
   db.prepare('INSERT INTO cpay_orders(id,tenant_id,user_id,plan,cycle,cents,created_at,reward_discount_cents) VALUES (?,?,?,?,?,?,?,?)').run(id,s.tenant_id,s.user_id,b.plan,b.cycle,cents,new Date(clock()).toISOString(),discount);
   // Per-order checkout: a shared public plan link cannot claim another agency's payment.
   const created=await createSale({id,plan:b.plan,cycle:b.cycle,cents});
   db.prepare("UPDATE cpay_orders SET checkout_id=?,identifier=?,state='pending' WHERE id=?").run(created.checkout_id,created.identifier,id);
   json(res,200,{url:'/checkout?order='+id,orderId:id,method:'crypto'});return true;
  }finally{locks.delete(s.tenant_id);}
 }
 return {route,poll,reconcile,activate,configured};
}

