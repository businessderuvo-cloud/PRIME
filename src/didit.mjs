import {createHmac, timingSafeEqual, randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {parseEnv} from 'node:util';
import path from 'node:path';
import {ApiError} from './validation.mjs';
import {root, transaction} from './database.mjs';
import {documentRenewalService} from './document-renewals.mjs';

// Platform configuration only: never accept credentials or workflow IDs from a tenant.
export function diditConfig({production=false, env=process.env}={}) {
 let local={};
 if(!production)try { local=parseEnv(readFileSync(path.join(root,'.env.didit-sandbox'),'utf8')); }
 catch(error){if(error.code!=='ENOENT')throw error;}
 const get=key=>env[key]??local[key]??'';
 return {apiKey:get('DIDIT_API_KEY'), workflowId:get('DIDIT_KYB_WORKFLOW_ID'), applicationId:get('DIDIT_APPLICATION_ID'),
  environment:get('DIDIT_ENVIRONMENT')||'sandbox', webhookSecret:get('DIDIT_WEBHOOK_SECRET'), allowLive:get('DIDIT_ALLOW_LIVE')==='1'};
}
// Write sorted keys directly: JSON.stringify(object) reorders integer-like keys.
export function canonicalDidit(value) {
 if(Array.isArray(value))return '['+value.map(canonicalDidit).join(',')+']';
 if(value!==null&&typeof value==='object')return '{'+Object.keys(value).sort((a,b)=>{
  const x=Array.from(a,c=>c.codePointAt(0)),y=Array.from(b,c=>c.codePointAt(0));
  for(let i=0;i<Math.min(x.length,y.length);i++)if(x[i]!==y[i])return x[i]-y[i];return x.length-y.length;
 }).map(key=>JSON.stringify(key)+':'+canonicalDidit(value[key])).join(',')+'}';
 return JSON.stringify(value);
}
export function verifyDidit(raw,body,headers,secret,now=Date.now()) {
 const timestamp=String(headers['x-timestamp']||'');
 if(!secret||!/^\d{1,12}$/.test(timestamp)||Math.abs(now/1000-Number(timestamp))>300)return false;
 const matches=(signature,data)=>{
  if(typeof signature!=='string'||!/^[a-f0-9]{64}$/i.test(signature))return false;
  return timingSafeEqual(Buffer.from(signature,'hex'),createHmac('sha256',secret).update(data).digest());
 };
 return ['x-signature-v2','x-signature-v2-previous'].some(h=>matches(headers[h],canonicalDidit(body))) ||
  ['x-signature','x-signature-previous'].some(h=>matches(headers[h],raw));
}
const statusOf=value=>String(value||'').trim().toLowerCase().replace(/[ -]+/g,'_');
const statuses=new Set(['not_started','in_progress','in_review','approved','declined','abandoned','expired','kyc_expired','resubmitted','cancelled']);
const active=new Set(['not_started','in_progress','in_review','resubmitted']);
const safeUrl=value=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&(u.hostname==='didit.me'||u.hostname.endsWith('.didit.me'))?u.href:'';}catch{return '';}};
const nowISO=()=>new Date().toISOString();
export function diditService({db,json,readBody,audit,fetcher=fetch,config=diditConfig()}) {
 const renewals=documentRenewalService(db);
 const pending=new Map(),refreshing=new Map();
 const ready=()=>!!(config.apiKey&&config.workflowId&&config.applicationId&&['sandbox','live'].includes(config.environment)&&(config.environment==='sandbox'||config.allowLive));
 const requireReady=()=>{if(!ready())throw new ApiError(503,'Verifica agenzia non configurata dalla piattaforma PRIME.');};
 const latest=tenant=>db.prepare('SELECT * FROM didit_kyb_sessions WHERE tenant_id=? AND environment=? ORDER BY created_at DESC,rowid DESC LIMIT 1').get(tenant,config.environment);
 const publicRow=row=>row?{id:row.id,status:row.status,url:safeUrl(row.verification_url),created_at:row.created_at,checked_at:row.checked_at}:null;
 const overview=tenant=>{const row=latest(tenant);return {configured:ready(),environment:config.environment,webhook_configured:!!config.webhookSecret,
  verified:config.environment==='live'&&row?.status==='approved',sandbox_verified:config.environment==='sandbox'&&row?.status==='approved',session:publicRow(row)};};
 async function request(endpoint,body){
  let response;
  try{response=await fetcher('https://verification.didit.me/v3/'+endpoint,{method:body?'POST':'GET',headers:{'x-api-key':config.apiKey,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000),redirect:'error'});}
  catch{throw new ApiError(502,'Didit non raggiungibile. Riprova tra poco.');}
  if(!response.ok)throw new ApiError(response.status===429?429:502,'Didit non ha completato la richiesta (HTTP '+response.status+').');
  try{return await response.json();}catch{throw new ApiError(502,'Risposta Didit non valida.');}
 }
 function checkScope(data,row){
  if(data.session_id!==row.session_id||data.workflow_id!==row.workflow_id||data.vendor_data!==row.vendor_data ||
   (data.application_id&&data.application_id!==row.application_id)||(data.environment&&data.environment!==row.environment)||
   (data.session_kind&&data.session_kind!=='business'))throw new ApiError(502,'La risposta Didit non corrisponde alla verifica agenzia.');
 }
 async function reconcile(row){
  requireReady();
  if(!row?.session_id)throw new ApiError(409,'Nessuna sessione Didit da aggiornare.');
  if(refreshing.has(row.id))return refreshing.get(row.id);
  const operation=(async()=>{
   const data=await request('session/'+encodeURIComponent(row.session_id)+'/decision/');
   checkScope(data,row);
   const status=statusOf(data.status);if(!statuses.has(status))throw new ApiError(502,'Stato Didit non riconosciuto.');
   const now=nowISO();
   transaction(db,()=>{
    db.prepare('UPDATE didit_kyb_sessions SET status=?,updated_at=?,checked_at=? WHERE id=?').run(status,now,now,row.id);
    renewals.capture({...row,status},data);
    if(status!==row.status)audit({tenant_id:row.tenant_id,user_id:row.requested_by},'agency.kyb.'+row.environment+'.'+status,row.id);
   });
   return overview(row.tenant_id);
  })();
  refreshing.set(row.id,operation);try{return await operation;}finally{refreshing.delete(row.id);}
 }
 async function start(session,renew=false){
  requireReady();const tenant=session.tenant_id;
  if(pending.has(tenant))return pending.get(tenant);
  const operation=(async()=>{
   let row=latest(tenant);
   if(row&&(active.has(row.status)||(row.status==='approved'&&!renew)))return overview(tenant);
   // An interrupted create has an uncertain remote outcome: do not blindly duplicate it.
   if(row?.status==='creating')throw new ApiError(409,'Creazione Didit da riconciliare con la piattaforma.');
   const id=randomUUID(),vendor='prime:'+config.environment+':'+randomUUID(),now=nowISO();
   db.prepare('INSERT INTO didit_kyb_sessions(id,tenant_id,requested_by,environment,application_id,workflow_id,vendor_data,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(id,tenant,session.user_id,config.environment,config.applicationId,config.workflowId,vendor,now,now);
   const data=await request('session/',{workflow_id:config.workflowId,vendor_data:vendor});
   const url=safeUrl(data.url),status=statusOf(data.status||'Not Started');
   if(typeof data.session_id!=='string'||!data.session_id||!url||!active.has(status)||
    (data.environment&&data.environment!==config.environment)||(data.workflow_id&&data.workflow_id!==config.workflowId))throw new ApiError(502,'Sessione Didit non valida.');
   db.prepare('UPDATE didit_kyb_sessions SET session_id=?,verification_url=?,status=?,updated_at=? WHERE id=?').run(data.session_id,url,status,nowISO(),id);
   audit(session,'agency.kyb.'+config.environment+'.started',id);
   return overview(tenant);
  })();
  pending.set(tenant,operation);try{return await operation;}finally{pending.delete(tenant);}
 }
 async function route(req,res,url,s){
  if(!url.pathname.startsWith('/api/kyb'))return false;
  if(!['owner','manager'].includes(s.role))throw new ApiError(403,'Verifica agenzia riservata al titolare o responsabile.');
  if(url.pathname==='/api/kyb/document-notifications'&&req.method==='GET'){
   json(res,200,{items:renewals.notifications(s.tenant_id,config.environment),canRenew:s.role==='owner'});return true;
  }
  if(url.pathname==='/api/kyb/renew-documents'&&req.method==='POST'){
   if(s.role!=='owner')throw new ApiError(403,'Solo il titolare può inviare i documenti dell’agenzia.');
   const body=await readBody(req);if(Object.keys(body).length)throw new ApiError(400,'La richiesta non accetta dati di configurazione.');
   if(!renewals.notifications(s.tenant_id,config.environment).length)throw new ApiError(409,'Nessun documento dell’agenzia da aggiornare.');
   json(res,200,await start(s,true));return true;
  }
  if(url.pathname==='/api/kyb'&&req.method==='GET'){json(res,200,overview(s.tenant_id));return true;}
  if(url.pathname==='/api/kyb/session'&&req.method==='POST'){
   if(s.role!=='owner')throw new ApiError(403,'Solo il titolare può avviare la verifica.');
   const body=await readBody(req);if(Object.keys(body).length)throw new ApiError(400,'La configurazione Didit è gestita dalla piattaforma.');
   json(res,200,await start(s));return true;
  }
  if(url.pathname==='/api/kyb/refresh'&&req.method==='POST'){await readBody(req);json(res,200,await reconcile(latest(s.tenant_id)));return true;}
  throw new ApiError(404,'Operazione KYB non disponibile.');
 }
 async function publicRoute(req,res,url){
  if(url.pathname!=='/api/webhooks/didit')return false;
  if(req.method!=='POST')throw new ApiError(405,'Metodo non consentito.');
  if(!config.webhookSecret)throw new ApiError(503,'Webhook Didit non configurato.');
  const chunks=[];let length=0;
  for await(const chunk of req){length+=chunk.length;if(length>2*1024*1024)throw new ApiError(413,'Webhook troppo grande.');chunks.push(chunk);}
  const raw=Buffer.concat(chunks);let body;
  try{body=JSON.parse(raw.toString('utf8'));if(!body||typeof body!=='object'||Array.isArray(body))throw Error();}catch{throw new ApiError(400,'Webhook JSON non valido.');}
  if(!verifyDidit(raw,body,req.headers,config.webhookSecret))throw new ApiError(401,'Firma Didit non valida.');
  if(body.application_id!==config.applicationId||body.environment!==config.environment)throw new ApiError(403,'Applicazione o ambiente Didit non valido.');
  if(req.headers['x-didit-test-webhook']==='true'){json(res,200,{ok:true,test:true});return true;}
  if(!['status.updated','data.updated'].includes(body.webhook_type)||body.session_kind!=='business'){json(res,200,{ok:true,ignored:true});return true;}
  if(typeof body.event_id!=='string'||!body.event_id||body.event_id.length>200)throw new ApiError(400,'Identificativo evento mancante.');
  const row=db.prepare('SELECT * FROM didit_kyb_sessions WHERE session_id=? AND application_id=? AND environment=?').get(body.session_id,config.applicationId,config.environment);
  if(!row){json(res,200,{ok:true,ignored:true});return true;}
  if(body.vendor_data!==row.vendor_data||(body.workflow_id&&body.workflow_id!==row.workflow_id))throw new ApiError(403,'Evento non associato alla verifica.');
  if(!db.prepare('SELECT 1 FROM didit_webhook_receipts WHERE application_id=? AND event_id=?').get(config.applicationId,body.event_id)){
   // Re-fetch the authoritative decision: retries or out-of-order notifications cannot overwrite it.
   await reconcile(row);
   db.prepare('INSERT OR IGNORE INTO didit_webhook_receipts VALUES (?,?,?,?)').run(config.applicationId,body.event_id,row.session_id,nowISO());
  }
  json(res,200,{ok:true});return true;
 }
 return {route,publicRoute,overview};
}
