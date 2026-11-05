import {randomBytes,createHmac,createHash,timingSafeEqual} from 'node:crypto';
import {ApiError} from './validation.mjs';
import { parsePhoneNumberFromString } from 'libphonenumber-js/max';
export function normalizeDemoPhone(value){const raw=String(value||'').trim();if(!/^[+0-9 ().-]{7,32}$/.test(raw))throw new ApiError(400,'Inserisci un numero internazionale valido.');const compact=raw.replace(/[ ().-]/g,'');let phone;if(compact.startsWith('+'))phone=parsePhoneNumberFromString(compact);else if(compact.startsWith('00'))phone=parsePhoneNumberFromString('+'+compact.slice(2));else if(/^3\d{8,9}$/.test(compact))phone=parsePhoneNumberFromString('+39'+compact);else throw new ApiError(400,'Seleziona il paese e inserisci il numero completo.');if(!phone?.isValid()||!['MOBILE','FIXED_LINE_OR_MOBILE'].includes(phone.getType()))throw new ApiError(400,'Inserisci un numero cellulare valido per il prefisso selezionato.');return phone.number;}
export function demoCallbackService({db,json,readBody,env=process.env,fetcher=fetch,production=false,now=Date.now}){
 db.exec('CREATE TABLE IF NOT EXISTS demo_quota_reset (id INTEGER PRIMARY KEY CHECK(id=1), reset_ms INTEGER NOT NULL)');
 const quotaStart=()=>Math.max(now()-86400000,db.prepare('SELECT reset_ms FROM demo_quota_reset WHERE id=1').get()?.reset_ms||0);
 const resetAttempts=new Map();
 const pending=new Map(),salt=env.PRIME_ELEVEN_API_KEY||randomBytes(32).toString('hex');
 const digest=x=>createHmac('sha256',salt).update(x).digest('hex');
 const browserEnabled=()=>!!(env.PRIME_ELEVEN_API_KEY&&env.PRIME_ELEVEN_AGENT_ID&&env.PRIME_ELEVEN_BRANCH_ID),callbackEnabled=()=>browserEnabled()&&!!env.PRIME_ELEVEN_PHONE_NUMBER_ID;
 return async(req,res,url)=>{
  if(!['/api/public/vanessa','/api/public/vanessa/callback','/api/public/vanessa/browser','/api/public/vanessa/reset-limit'].includes(url.pathname))return false;
  const ip=digest(production?(req.headers['fly-client-ip']||req.socket.remoteAddress):req.socket.remoteAddress);
  for(const [k,v]of pending)if(v.expires<now())pending.delete(k);
  if(req.method==='GET'&&(url.pathname==='/api/public/vanessa'||url.pathname==='/api/public/vanessa/browser')){
   const browserRequest=url.pathname==='/api/public/vanessa/browser';if(!(browserRequest?browserEnabled():callbackEnabled())){json(res,200,{available:false});return true;}
   if(pending.size>=1000)throw new ApiError(429,'Attendi qualche minuto prima di riprovare.');
   const challenge=randomBytes(24).toString('hex');pending.set(challenge,{ip,expires:now()+600000});
   res.setHeader('Set-Cookie','prime_demo='+challenge+'; Path=/api/public/vanessa; HttpOnly; SameSite=Strict; Max-Age=600'+(production?'; Secure':''));
   json(res,200,{available:true,challenge});return true;
  }
  if(!['/api/public/vanessa/callback','/api/public/vanessa/browser','/api/public/vanessa/reset-limit'].includes(url.pathname)||req.method!=='POST')throw new ApiError(405,'Metodo non consentito');
  const browserRequest=url.pathname!=='/api/public/vanessa/callback';if(!(browserRequest?browserEnabled():callbackEnabled()))throw new ApiError(503,browserRequest?'La demo vocale non è disponibile al momento.':'La richiamata non è disponibile al momento. Scrivi a phoenix@primegestionale.it.');
  const origin=req.headers.origin,expected=(production?'https://':'http://')+req.headers.host;
  if(!origin||origin!==expected||req.headers['sec-fetch-site']==='cross-site')throw new ApiError(403,'Apri il modulo dal sito PRIME.');
  if(url.pathname==='/api/public/vanessa/reset-limit'){
   for(const [key,value] of resetAttempts)if(value.expires<=now())resetAttempts.delete(key);
   const attempts=resetAttempts.get(ip)||{count:0,expires:now()+900000};
   if(attempts.count>=5||resetAttempts.size>=10000)throw new ApiError(429,'Troppi tentativi. Riprova tra 15 minuti.');
   attempts.count++;resetAttempts.set(ip,attempts);
   const body=await readBody(req);
   if(typeof body.code!=='string'||body.code.length>128||!timingSafeEqual(createHash('sha256').update(body.code).digest(),Buffer.from('edb1b2ad6b84b78f89014194003cbf802c886c9ed732560d472759ca2886119f','hex')))throw new ApiError(403,'Codice non valido.');
   db.prepare('INSERT INTO demo_quota_reset (id,reset_ms) VALUES (1,?) ON CONFLICT(id) DO UPDATE SET reset_ms=excluded.reset_ms').run(now());
   resetAttempts.delete(ip);json(res,200,{reset:true,message:'Limite giornaliero reimpostato. Puoi riprovare con Vanessa.'});return true;
  }
  const b=await readBody(req),c=pending.get(b.challenge);
  const language=b.language||'it';if(!['it','en'].includes(language))throw new ApiError(400,'Lingua non supportata.');
  const agentOverride={language,...(language==='en'?{first_message:"Hi there, I'm Vanessa! Don't be shy — ask me anything you'd like to know about PRIME."}:{})};
  if(!c||c.ip!==ip||c.expires<now()||!String(req.headers.cookie||'').split(';').some(x=>x.trim()==='prime_demo='+b.challenge))throw new ApiError(403,'Ricarica la pagina prima di richiedere la chiamata.');
  if(Object.keys(b).some(k=>!['phone','consent','challenge','website','language'].includes(k))||b.website||b.consent!==true)throw new ApiError(400,browserRequest?'Conferma il consenso alla conversazione AI.':'Conferma che il numero è tuo e che desideri la chiamata AI.');
  if(url.pathname==='/api/public/vanessa/browser'){
   if('phone' in b)throw new ApiError(400,'Il numero non serve per la chiamata nel browser.');
   const stamp=now(),limit=Number(env.PRIME_DEMO_DAILY_CALL_LIMIT||10),browserIp=digest('browser:'+ip);
   db.prepare('DELETE FROM demo_callbacks WHERE created_ms<?').run(stamp-7*86400000);
   if(!Number.isSafeInteger(limit)||limit<1)throw new ApiError(503,'La demo è momentaneamente sospesa.');
   const total=db.prepare('SELECT COUNT(*) AS n FROM demo_callbacks WHERE created_ms>?').get(quotaStart()).n;
   const used=db.prepare('SELECT COUNT(*) AS n FROM demo_callbacks WHERE created_ms>? AND ip_hash=?').get(quotaStart(),browserIp).n;
   if(total>=limit||used>=3)throw new ApiError(429,'La demo ha raggiunto il limite giornaliero. Riprova domani.');
   pending.delete(b.challenge);const id=randomBytes(16).toString('hex');
   db.prepare('INSERT INTO demo_callbacks VALUES (?,?,?,?,?)').run(id,'browser',browserIp,stamp,'browser_pending');
   try{
    const target=new URL('https://api.elevenlabs.io/v1/convai/conversation/get-signed-url');target.searchParams.set('agent_id',env.PRIME_ELEVEN_AGENT_ID);target.searchParams.set('branch_id',env.PRIME_ELEVEN_BRANCH_ID);target.searchParams.set('include_conversation_id','true');
    const response=await fetcher(target.href,{headers:{'xi-api-key':env.PRIME_ELEVEN_API_KEY},signal:AbortSignal.timeout(15000)}),data=await response.json();
    if(!response.ok)throw new Error('Provider refused');const signed=new URL(data.signed_url);if(signed.protocol!=='wss:'||signed.hostname!=='api.elevenlabs.io'||signed.pathname!=='/v1/convai/conversation')throw new Error('Invalid signed URL');
    
    db.prepare('UPDATE demo_callbacks SET state=? WHERE id=?').run('browser_ready',id);json(res,200,{signedUrl:signed.href,language,overrides:{agent:{language,...(language==='en'?{firstMessage:agentOverride.first_message}:{})}}});
   }catch{db.prepare('UPDATE demo_callbacks SET state=? WHERE id=?').run('browser_failed',id);throw new ApiError(502,'Non riesco a collegare Vanessa. Riprova più tardi o scrivi a phoenix@primegestionale.it.');}
   return true;
  }
  const phone=normalizeDemoPhone(b.phone),phoneHash=digest(phone),stamp=now();
  db.prepare('DELETE FROM demo_callbacks WHERE created_ms<?').run(stamp-7*86400000);
  const count=db.prepare('SELECT COUNT(*) AS n FROM demo_callbacks WHERE created_ms>?').get(quotaStart()).n;
  const limit=Number(env.PRIME_DEMO_DAILY_CALL_LIMIT||10);
  if(!Number.isSafeInteger(limit)||limit<1)throw new ApiError(503,'La demo è momentaneamente sospesa.');
  if(count>=limit||db.prepare('SELECT 1 FROM demo_callbacks WHERE created_ms>? AND (phone_hash=? OR ip_hash=?)').get(quotaStart(),phoneHash,ip))throw new ApiError(429,'La demo è già stata richiesta o ha raggiunto il limite giornaliero. Riprova domani.');
  pending.delete(b.challenge);const id=randomBytes(16).toString('hex');
  db.prepare('INSERT INTO demo_callbacks VALUES (?,?,?,?,?)').run(id,phoneHash,ip,stamp,'pending');
  try{
   const response=await fetcher('https://api.elevenlabs.io/v1/convai/sip-trunk/outbound-call',{method:'POST',headers:{'Content-Type':'application/json','xi-api-key':env.PRIME_ELEVEN_API_KEY},signal:AbortSignal.timeout(15000),body:JSON.stringify({agent_id:env.PRIME_ELEVEN_AGENT_ID,agent_phone_number_id:env.PRIME_ELEVEN_PHONE_NUMBER_ID,to_number:phone,conversation_initiation_client_data:{branch_id:env.PRIME_ELEVEN_BRANCH_ID,conversation_config_override:{agent:agentOverride}}})});
   const data=await response.json();if(!response.ok||data.success!==true)throw new Error('Provider did not confirm');
   db.prepare('UPDATE demo_callbacks SET state=? WHERE id=?').run('requested',id);
   json(res,202,{requested:true,message:'Richiesta accettata: Vanessa proverà a chiamarti tra poco. Tieni il telefono a portata di mano.'});
  }catch{db.prepare('UPDATE demo_callbacks SET state=? WHERE id=?').run('unconfirmed',id);throw new ApiError(502,'Non possiamo confermare l’avvio della chiamata. Attendi qualche minuto; se non arriva, contatta phoenix@primegestionale.it.');}
  return true;
 };
}
