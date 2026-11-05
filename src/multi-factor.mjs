import {randomBytes,randomInt,createHash,timingSafeEqual} from 'node:crypto';
import QRCode from 'qrcode';
import {ApiError} from './validation.mjs';
import {verifyTotp,totpUri} from './totp.mjs';
const digest=v=>createHash('sha256').update(String(v)).digest('hex');
const equal=(a,b)=>{const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&timingSafeEqual(x,y)};
export const factorMethods=u=>[...(u.totp_enabled?['totp']:[]),...(u.email_2fa_enabled?['email']:[]),...(u.sms_2fa_enabled?['sms']:[])];
export function multiFactor({db,vault,mailer,passwordCheck,json,readBody,createSession,audit,smsSender}){
 const attempts=new Map();
 const user=id=>db.prepare('SELECT * FROM users WHERE id=?').get(id);
 const read=(cipher,context)=>vault.open(cipher,context);
 function throttle(id){const now=Date.now(),previous=attempts.get(id);if(previous&&previous.after>now&&previous.count>=8)throw new ApiError(429,'Troppe richieste di sicurezza. Attendi cinque minuti.');attempts.set(id,previous&&previous.after>now?{...previous,count:previous.count+1}:{count:1,after:now+300000});if(attempts.size>2000)for(const[k,v]of attempts)if(v.after<now)attempts.delete(k);}
 function challenge(u,tenant,purpose='login'){
  const methods=factorMethods(u);const token=randomBytes(32).toString('hex'),now=Date.now();
  db.prepare('DELETE FROM auth_challenges WHERE expires_at<? OR (user_id=? AND purpose=?)').run(now,u.id,purpose);
  db.prepare('INSERT INTO auth_challenges(token_hash,user_id,tenant_id,expires_at,created_at,methods,purpose,policy) VALUES(?,?,?,?,?,?,?,?)').run(digest(token),u.id,tenant,now+300000,new Date(now).toISOString(),JSON.stringify(methods),purpose,u.two_factor_policy);
  return {requires_two_factor:true,challenge:token,methods,policy:u.two_factor_policy,verified:[]};
 }
 function rowFor(token){const row=db.prepare('SELECT * FROM auth_challenges WHERE token_hash=? AND expires_at>? AND attempts<5').get(digest(token),Date.now());if(!row)throw new ApiError(401,'Verifica scaduta. Accedi di nuovo.');return row;}
 async function code(u,method,purpose,extra={}){
  throttle(u.id+':send');const token=randomBytes(32).toString('hex'),pin=String(randomInt(1000000)).padStart(6,'0'),now=Date.now();
  db.prepare('DELETE FROM auth_factor_codes WHERE expires_at<? OR (user_id=? AND purpose=? AND method=?)').run(now,u.id,purpose,method);
  const hash=digest(token),payload={code:pin,...extra};
  db.prepare('INSERT INTO auth_factor_codes VALUES(?,?,?,?,?,?,0,?)').run(hash,u.id,method,purpose,vault.seal(payload,'mfa:'+hash),now+300000,now);
  try{
   const message=`Il codice di sicurezza PRIME è ${pin}. Scade tra 5 minuti. Non condividerlo.`;
   if(method==='email'){if(!mailer.configured)throw new ApiError(503,'Il servizio email di sicurezza non è configurato.');await mailer.send({to:u.email,subject:'Codice di sicurezza · PRIME',message,actionUrl:'',actionLabel:''});}
   else{if(!smsSender?.configured)throw new ApiError(503,'Il servizio SMS di sicurezza non è configurato.');const phone=extra.phone||read(u.sms_2fa_phone_cipher,'auth:sms:'+u.id).phone;if(smsSender.sendOtp){delete payload.code;payload.phone=phone;payload.verification=await smsSender.sendOtp(phone);db.prepare('UPDATE auth_factor_codes SET payload_cipher=? WHERE token_hash=?').run(vault.seal(payload,'mfa:'+hash),hash);}else await smsSender.send({to:phone,message});}
  }catch(e){db.prepare('DELETE FROM auth_factor_codes WHERE token_hash=?').run(hash);throw e;}
  return token;
 }
 async function checkCode(token,pin,id,method,purpose){const hash=digest(token),row=db.prepare('SELECT * FROM auth_factor_codes WHERE token_hash=? AND expires_at>? AND attempts<5').get(hash,Date.now());if(!row||row.user_id!==id||row.method!==method||row.purpose!==purpose)throw new ApiError(401,'Codice scaduto o non valido.');const value=read(row.payload_cipher,'mfa:'+hash);db.prepare('UPDATE auth_factor_codes SET attempts=attempts+1 WHERE token_hash=?').run(hash);const approved=method==='sms'&&smsSender?.checkOtp?await smsSender.checkOtp(value.phone,pin,value.verification):equal(value.code,pin);if(!approved){throw new ApiError(401,'Codice non valido.');}if(!db.prepare('DELETE FROM auth_factor_codes WHERE token_hash=?').run(hash).changes)throw new ApiError(401,'Codice già utilizzato.');return value;}
 async function authorize(s,b){throttle(s.user_id+':settings');const u=user(s.user_id);if(!await passwordCheck(String(b.password||''),u.password))throw new ApiError(401,'Password non corretta.');if(factorMethods(u).length){const row=db.prepare("SELECT * FROM auth_factor_codes WHERE token_hash=? AND user_id=? AND purpose='grant' AND expires_at>?").get(digest(b.grant||''),u.id,Date.now());if(!row)throw new ApiError(403,'Conferma prima la verifica di sicurezza con i metodi già attivi.');}return u;}
 async function publicRoute(req,res,url){
  if(!['/api/auth/2fa/send','/api/auth/2fa/verify'].includes(url.pathname)||req.method!=='POST')return false;
  const b=await readBody(req),row=rowFor(b.challenge),u=user(row.user_id),methods=JSON.parse(row.methods),verified=JSON.parse(row.verified);
  const method=b.method||'totp';if(!methods.includes(method)||!factorMethods(u).includes(method))throw new ApiError(400,'Metodo non attivo su questo account.');
  if(url.pathname.endsWith('/send')){if(method==='totp')throw new ApiError(400,'Usa il codice della tua app.');const codeToken=await code(u,method,'challenge:'+row.token_hash);json(res,200,{ok:true,code_token:codeToken});return true;}
  let valid=false;
  try{if(method==='totp')valid=verifyTotp(read(u.totp_secret_cipher,'auth:totp:'+u.id).secret,b.code);else{await checkCode(b.code_token,b.code,u.id,method,'challenge:'+row.token_hash);valid=true;}}catch(e){if(e.status!==401)throw e;}
  if(!db.prepare('SELECT 1 FROM auth_challenges WHERE token_hash=? AND expires_at>? AND attempts<5').get(row.token_hash,Date.now()))throw new ApiError(401,'Verifica scaduta o già utilizzata.');
  if(!valid){db.prepare('UPDATE auth_challenges SET attempts=attempts+1 WHERE token_hash=?').run(row.token_hash);throw new ApiError(401,'Codice non valido o scaduto.');}
  if(!verified.includes(method))verified.push(method);
  if(row.policy==='all'&&!methods.every(m=>verified.includes(m))){db.prepare('UPDATE auth_challenges SET verified=? WHERE token_hash=?').run(JSON.stringify(verified),row.token_hash);json(res,200,{requires_two_factor:true,challenge:b.challenge,methods,policy:row.policy,verified});return true;}
  if(row.purpose==='login'&&!db.prepare("SELECT 1 FROM memberships m JOIN tenants t ON t.id=m.tenant_id WHERE m.user_id=? AND m.tenant_id=? AND t.account_status='active'").get(u.id,row.tenant_id))throw new ApiError(403,'Account non disponibile.');
  if(!db.prepare('DELETE FROM auth_challenges WHERE token_hash=?').run(row.token_hash).changes)throw new ApiError(401,'Verifica già utilizzata.');
  if(row.purpose==='settings'){const grant=randomBytes(32).toString('hex');db.prepare('INSERT INTO auth_factor_codes VALUES(?,?,?,?,?,?,0,?)').run(digest(grant),u.id,'grant','grant',vault.seal({},'mfa:'+digest(grant)),Date.now()+300000,Date.now());json(res,200,{ok:true,grant});}
  else{createSession(res,u.id,row.tenant_id);json(res,200,{ok:true});}
  return true;
 }
 async function route(req,res,url,s){
  const p=url.pathname;if(!p.startsWith('/api/account/security'))return false;
  const u=user(s.user_id);res.setHeader('Cache-Control','no-store');
  if(p==='/api/account/security'&&req.method==='GET'){json(res,200,{email_verified:!!u.email_verified,two_factor_enabled:factorMethods(u).length>0,methods:factorMethods(u),policy:u.two_factor_policy,email_provider_configured:mailer.configured,sms_provider_configured:!!smsSender?.configured,sms_phone:u.sms_2fa_enabled?'••••'+read(u.sms_2fa_phone_cipher,'auth:sms:'+u.id).phone.slice(-4):''});return true;}
  if(p==='/api/account/security/totp/qr'&&req.method==='GET'){if(!u.totp_pending_cipher)throw new ApiError(400,'Avvia la configurazione Authenticator.');const {secret}=read(u.totp_pending_cipher,'auth:totp-pending:'+u.id);const svg=await QRCode.toString(totpUri(secret,u.email),{type:'svg',margin:2,width:256});res.writeHead(200,{'Content-Type':'image/svg+xml'});res.end(svg);return true;}
  if(req.method!=='POST')return false;
  if(p==='/api/account/security/challenge'){const b=await readBody(req);throttle(u.id+':settings');if(!await passwordCheck(String(b.password||''),u.password))throw new ApiError(401,'Password non corretta.');json(res,200,factorMethods(u).length?challenge(u,s.tenant_id,'settings'):{ok:true});return true;}
  if(p==='/api/account/security/factors/setup'){const b=await readBody(req);await authorize(s,b);if(!['email','sms'].includes(b.method))throw new ApiError(400,'Metodo non valido.');if(b.method==='email'&&!u.email_verified)throw new ApiError(400,'Verifica prima la tua email.');if(b.method==='sms'&&!/^\+[1-9]\d{7,14}$/.test(b.phone||''))throw new ApiError(400,'Usa un numero internazionale, ad esempio +39…');const token=await code(u,b.method,'enroll',b.method==='sms'?{phone:b.phone}:{});json(res,200,{ok:true,token});return true;}
  if(p==='/api/account/security/factors/enable'){const b=await readBody(req);await authorize(s,b);if(!['email','sms'].includes(b.method))throw new ApiError(400,'Metodo non valido.');const value=await checkCode(b.token,b.code,u.id,b.method,'enroll');if(b.method==='email')db.prepare('UPDATE users SET email_2fa_enabled=1 WHERE id=?').run(u.id);else db.prepare('UPDATE users SET sms_2fa_enabled=1,sms_2fa_phone_cipher=? WHERE id=?').run(vault.seal({phone:value.phone},'auth:sms:'+u.id),u.id);changed(s,b.method);json(res,200,{ok:true});return true;}
  if(p==='/api/account/security/factors/disable'){const b=await readBody(req);await authorize(s,b);if(!['email','sms'].includes(b.method))throw new ApiError(400,'Metodo non valido.');if(b.method==='email')db.prepare('UPDATE users SET email_2fa_enabled=0 WHERE id=?').run(u.id);else db.prepare("UPDATE users SET sms_2fa_enabled=0,sms_2fa_phone_cipher='' WHERE id=?").run(u.id);changed(s,b.method);json(res,200,{ok:true});return true;}
  if(p==='/api/account/security/policy'){const b=await readBody(req);await authorize(s,b);if(!['any','all'].includes(b.policy))throw new ApiError(400,'Scegli uno o tutti i metodi.');db.prepare('UPDATE users SET two_factor_policy=? WHERE id=?').run(b.policy,u.id);changed(s,'policy');json(res,200,{ok:true});return true;}
  return false;
 }
 function changed(s,method){db.prepare('DELETE FROM auth_challenges WHERE user_id=?').run(s.user_id);audit(s,'auth.factor_changed',method);}
 return {challenge,publicRoute,route,authorize,changed};
}
export function authSmsWebhook({url=process.env.PRIME_AUTH_SMS_WEBHOOK_URL,token=process.env.PRIME_AUTH_SMS_WEBHOOK_TOKEN,fetcher=fetch}={}){
 const configured=!!(url&&token);if(configured){const parsed=new URL(url);if(parsed.protocol!=='https:'||parsed.username||parsed.password)throw Error('Webhook SMS: richiesto HTTPS.');}
 return {configured,async send(body){if(!configured)throw new ApiError(503,'Servizio SMS non configurato.');let r;try{r=await fetcher(url,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(10000)});}catch{throw new ApiError(502,'Servizio SMS non raggiungibile.');}if(!r.ok)throw new ApiError(502,'Invio SMS non accettato.');}};
}

export function authSmsVerify({sid=process.env.TWILIO_ACCOUNT_SID,token=process.env.TWILIO_AUTH_TOKEN,service=process.env.PRIME_TWILIO_VERIFY_SERVICE_SID,fetcher=fetch}={}){
 const configured=!!(sid&&token&&/^VA[a-f0-9]{32}$/i.test(service||''));
 async function request(path,body){if(!configured)throw new ApiError(503,'Servizio SMS non configurato.');let response;try{response=await fetcher('https://verify.twilio.com/v2/Services/'+service+'/'+path,{method:'POST',headers:{Authorization:'Basic '+Buffer.from(sid+':'+token).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(body),redirect:'error',signal:AbortSignal.timeout(10000)});}catch{throw new ApiError(502,'Servizio SMS non raggiungibile.');}if(path==='VerificationCheck'&&response.status===404)return {status:'expired'};if(!response.ok)throw new ApiError(response.status===429?429:502,'Verifica SMS non disponibile. Controlla il numero e riprova più tardi.');return response.json();}
 return {configured,async sendOtp(phone){const r=await request('Verifications',{To:phone,Channel:'sms',Locale:'it'});if(r.status!=='pending'||!/^VE[a-f0-9]{32}$/i.test(r.sid||''))throw new ApiError(502,'Invio SMS non confermato.');return r.sid;},async checkOtp(phone,code,verification){if(!/^\d{6}$/.test(String(code||'')))return false;const r=await request('VerificationCheck',{VerificationSid:verification,Code:code});return r.status==='approved'&&r.to===phone;}};
}
