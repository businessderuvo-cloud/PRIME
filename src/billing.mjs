import {plans,customerRates} from '../public/pricing.js';
import {ApiError} from './validation.mjs';
import {usageService} from './ai-usage.mjs';
import {customerCallRate} from './provider-pricing.mjs';

// Only final customer-facing tariffs belong in this configuration.
export function publicOverage(){return {...customerRates,minutes:customerCallRate()};}
function httpsUrl(value){
 try{const u=new URL(value);if(u.protocol==='https:'&&!u.username&&!u.password)return u.href;}catch{}
 return null;
}
export function billingService({db,json,readBody,env=process.env}){
 const usage=usageService(db);
 return async function route(req,res,url,s){
  if(!url.pathname.startsWith('/api/billing/'))return false;
  if(s.role!=='owner')throw new ApiError(403,'Solo il titolare può gestire verifica e abbonamento');
  if(url.pathname==='/api/billing/usage'&&req.method==='GET'){
   json(res,200,{...usage.summary(s.tenant_id),events:usage.events(s.tenant_id)});return true;
  }
  const state=db.prepare('SELECT kyb_status FROM agency_billing WHERE tenant_id=?').get(s.tenant_id);
  const approved=state?.kyb_status==='approved';
  if(url.pathname==='/api/billing/enquiry'&&req.method==='POST'){
   const b=await readBody(req),message=String(b.message||'').trim();
   if(message.length<10||message.length>3000)throw new ApiError(400,'Descrivi la tua rete con un messaggio da 10 a 3.000 caratteri.');
   db.prepare('INSERT INTO franchise_enquiries(tenant_id,message,updated_at) VALUES (?,?,?) ON CONFLICT(tenant_id) DO UPDATE SET message=excluded.message,updated_at=excluded.updated_at').run(s.tenant_id,message,new Date().toISOString());
   json(res,200,{saved:true});return true;
  }
  if(url.pathname==='/api/billing/status'&&req.method==='GET'){
   json(res,200,{kyb:state?.kyb_status||'unverified',canChoosePlan:approved,canPay:approved});return true;
  }
  if(url.pathname==='/api/billing/kyb'&&req.method==='POST'){
   const link=httpsUrl(env.PRIME_KYB_START_URL);
   if(!link)throw new ApiError(503,'La verifica aziendale non è ancora disponibile. Nessun acquisto è possibile finché il KYB non è approvato.');
   // Opening the verification link never approves the agency. Only the verified
   // provider integration may persist approval and its external reference.
   json(res,200,{url:link});return true;
  }
  if(url.pathname==='/api/billing/checkout'&&req.method==='POST'){
   if(!approved)throw new ApiError(403,'Completa la verifica aziendale e attendi l’approvazione prima di scegliere o pagare un piano.');
   const b=await readBody(req);
   if(b.plan==='secret')throw new ApiError(409,'Secret Plan richiede un preventivo personalizzato. Il contatto commerciale deve essere configurato.');
   const p=Object.hasOwn(plans,b.plan)?plans[b.plan]:null;
   if(!p||!['monthly','annual'].includes(b.cycle)||(b.cycle==='annual'&&!p.annual))throw new ApiError(400,'Piano o periodicità non validi');
   const field=p.ai?'ai':'humans', count=b[field];
   if(!Number.isSafeInteger(count)||count<1||count>1000)throw new ApiError(400,'Numero agenti non valido');
   const included=p.ai||p.humans;
   // Each link represents a merchant-created Suby offer with exact quantities.
   // Never append client-controlled amounts to a hosted checkout URL.
   const quantity=Math.max(count,included);
   const configKey=`PRIME_SUBY_${b.plan.toUpperCase()}_${b.cycle.toUpperCase()}_${quantity}_URL`;
   const link=httpsUrl(env[configKey]);
   if(!link)throw new ApiError(503,'Il pagamento Suby per questa configurazione non è ancora disponibile. Nessun importo è stato addebitato.');
   json(res,200,{url:link});return true;
  }
  throw new ApiError(404,'Operazione abbonamento non disponibile');
 };
}
