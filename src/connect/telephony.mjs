import {createHash,createHmac} from 'node:crypto';
import {ApiError} from '../validation.mjs';

const providers=['zadarma','cloudtalk'];
export const telephonyAllowed=edition=>['vip','elite'].includes(edition);
export function telephonyService({db,vault,json,readBody,audit,editionFor,fetcher=fetch,demo=false,clock=Date.now}){
  const attempts=new Map();
  const context=(tenant,provider)=>'telephony:'+tenant+':'+provider;
  function credentials(session,provider){
    if(!telephonyAllowed(editionFor(session)))throw new ApiError(403,'Telefonia disponibile da VIP, Elite e Secret Plan.');
    const row=db.prepare('SELECT * FROM telephony_settings WHERE tenant_id=? AND provider=?').get(session.tenant_id,provider);
    return row&&!row.demo?{...vault.open(row.credentials_cipher,context(session.tenant_id,provider)),sip:row.sip,phoneNumber:row.phone_number}:null;
  }
  async function route(req,res,url,session){
    if(url.pathname!=='/api/connect/telephony'&&!url.pathname.startsWith('/api/connect/telephony/'))return false;
    if(!telephonyAllowed(editionFor(session)))throw new ApiError(403,'Telefonia disponibile da VIP, Elite e Secret Plan.');
    if(session.role==='external')throw new ApiError(403,'Collegamento riservato al team dell’agenzia.');
    const provider=url.pathname.split('/')[4];
    if(req.method==='GET'&&!provider){
      const rows=db.prepare('SELECT provider,phone_number,sip,verified_at,demo FROM telephony_settings WHERE tenant_id=?').all(session.tenant_id);
      json(res,200,{demo,providers:providers.map(id=>({provider:id,...(rows.find(row=>row.provider===id)||{}),configured:rows.some(row=>row.provider===id)}))});return true;
    }
    if(!providers.includes(provider))throw new ApiError(404,'Provider non disponibile.');
    if(!['owner','manager'].includes(session.role))throw new ApiError(403,'Solo il titolare o responsabile può configurare la telefonia.');
    if(req.method==='DELETE'){
      db.prepare('DELETE FROM telephony_settings WHERE tenant_id=? AND provider=?').run(session.tenant_id,provider);
      audit(session,'telephony.disconnected',provider);json(res,200,{disconnected:true});return true;
    }
    if(req.method!=='PUT')throw new ApiError(405,'Metodo non disponibile.');
    const body=await readBody(req),key=String(body.apiKey||'').trim(),secret=String(body.apiSecret||'').trim();
    if(!key||!secret||key.length>2048||secret.length>4096||/[\r\n:]/.test(key)||/[\r\n]/.test(secret))throw new ApiError(400,'Inserisci API Key e API Secret valide.');
    const phone=String(body.phoneNumber||'').replace(/[\s().-]/g,''),sip=String(body.sip||'').trim();
    if(!/^\+[1-9]\d{7,14}$/.test(phone))throw new ApiError(400,'Inserisci il numero con prefisso internazionale, per esempio +39.');
    if(provider==='zadarma'&&!/^\d{3,6}-\d{3}$/.test(sip))throw new ApiError(400,'Inserisci il SIP supervisore nel formato 123456-101.');
    if(demo&&(key!=='demo-key'||secret!=='demo-secret'))throw new ApiError(400,'Usa solo le credenziali dimostrative precompilate nella demo pubblica.');
    const bucketKey=session.tenant_id+':'+provider,previous=attempts.get(bucketKey);
    if(previous&&clock()-previous.time<60000&&previous.count>=10)throw new ApiError(429,'Troppe verifiche: attendi un minuto.');
    attempts.set(bucketKey,previous&&clock()-previous.time<60000?{time:previous.time,count:previous.count+1}:{time:clock(),count:1});
    if(!demo){
      let response;
      try{
        if(provider==='zadarma'){
          const path='/v1/info/balance/',query='',digest=createHash('md5').update(query).digest('hex');
          const signature=Buffer.from(createHmac('sha1',secret).update(path+query+digest).digest('hex')).toString('base64');
          response=await fetcher('https://api.zadarma.com'+path,{headers:{Authorization:key+':'+signature,Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(15000)});
        }else response=await fetcher('https://my.cloudtalk.io/api/agents/index.json',{headers:{Authorization:'Basic '+Buffer.from(key+':'+secret).toString('base64'),Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(15000)});
      }catch{throw new ApiError(502,'Il provider non ha risposto alla verifica. Riprova.');}
      if(!response.ok)throw new ApiError(response.status===401||response.status===403?400:502,'Credenziali non verificate: controlla API Key, Secret e permessi nel provider.');
      const payload=await response.json().catch(()=>null);
      if(provider==='zadarma'?payload?.status!=='success':!Array.isArray(payload?.responseData?.data))throw new ApiError(502,'Il provider non ha confermato l’accesso API.');
    }
    const stamp=new Date(clock()).toISOString(),cipher=vault.seal({apiKey:key,apiSecret:secret},context(session.tenant_id,provider));
    db.prepare('INSERT INTO telephony_settings VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(tenant_id,provider) DO UPDATE SET credentials_cipher=excluded.credentials_cipher,phone_number=excluded.phone_number,sip=excluded.sip,verified_at=excluded.verified_at,demo=excluded.demo,updated_by=excluded.updated_by').run(session.tenant_id,provider,cipher,phone,sip,stamp,demo?1:0,session.user_id);
    audit(session,demo?'telephony.demo_configured':'telephony.api_verified',provider);
    json(res,200,{configured:true,demo,provider,phone_number:phone,sip,verified_at:stamp});return true;
  }
  return {route,credentials};
}
