import {randomBytes,randomInt,createHash,createPublicKey,verify} from 'node:crypto';
import QRCode from 'qrcode';
import {ApiError} from './validation.mjs';
import {factorMethods} from './multi-factor.mjs';
const hash=v=>createHash('sha256').update(String(v||'')).digest('hex');
const token=()=>randomBytes(32).toString('base64url');
const validToken=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{43}$/.test(v);
const fail=(status,message)=>{throw new ApiError(status,message);};
export function authenticatorQr({db,json,readBody,createSession,audit,mfa,publicUrl=()=>process.env.PRIME_PUBLIC_URL||'https://primegestionale.it',now=Date.now}){
 const limits=new Map();
 function limit(req,key,max=30){const id=(req.headers['fly-client-ip']||req.socket?.remoteAddress||'local')+':'+key,t=now(),old=limits.get(id);if(old&&old.until>t){if(++old.count>max)fail(429,'Troppe richieste. Attendi qualche minuto.');}else limits.set(id,{count:1,until:t+300000});if(limits.size>2000)for(const[k,v]of limits)if(v.until<t)limits.delete(k);}
 const origin=()=>new URL(publicUrl()).origin;
 function sameOrigin(req){if(req.headers.origin&&req.headers.origin!==origin())fail(403,'Origine della richiesta non valida.');}
 const qr=async(action,id,secret)=>{const u=new URL('/authenticator/',origin());u.hash=new URLSearchParams({['prime-'+action]:id+'.'+secret}).toString();return {url:u.href,svg:await QRCode.toString(u.href,{type:'svg',margin:2,width:280})};};
 function login(b){if(!validToken(b.id)||!validToken(b.nonce))fail(401,'QR non valido o scaduto.');const r=db.prepare("SELECT * FROM authenticator_logins WHERE id=? AND nonce_hash=? AND expires_at>? AND status='pending'").get(b.id,hash(b.nonce),now());if(!r)fail(401,'QR scaduto o già utilizzato. Generane uno nuovo.');return r;}
 const message=(r,nonce)=>JSON.stringify({protocol:'prime-qr-login-v1',origin:origin(),id:r.id,nonce,expires_at:r.expires_at,browser:r.browser,match_code:r.match_code});
 function pairing(b){if(!validToken(b.id)||!validToken(b.token))fail(401,'Abbinamento non valido.');const r=db.prepare('SELECT * FROM authenticator_pairings WHERE id=? AND token_hash=? AND expires_at>?').get(b.id,hash(b.token),now());if(!r)fail(401,'Abbinamento scaduto. Ripeti da Sicurezza account.');return r;}
 function activeDevice(id){return db.prepare("SELECT d.*,u.email,u.email_verified,u.totp_enabled,u.email_2fa_enabled,u.sms_2fa_enabled,u.two_factor_policy FROM authenticator_devices d JOIN users u ON u.id=d.user_id JOIN memberships m ON m.user_id=d.user_id AND m.tenant_id=d.tenant_id JOIN tenants t ON t.id=d.tenant_id WHERE d.id=? AND d.revoked_at IS NULL AND t.account_status='active' AND u.email_verified=1").get(id);}
 async function publicRoute(req,res,url){
  if(!url.pathname.startsWith('/api/auth/qr/')||req.method!=='POST')return false;
  sameOrigin(req);const action=url.pathname.slice('/api/auth/qr/'.length),b=await readBody(req);
  if(action==='start'){
   limit(req,'start',20);db.prepare('DELETE FROM authenticator_logins WHERE expires_at<?').run(now());db.prepare('DELETE FROM authenticator_pairings WHERE expires_at<?').run(now());
   const id=token(),nonce=token(),poll=token(),expires=now()+180000,match=String(randomInt(1000000)).padStart(6,'0');
   const ua=String(req.headers['user-agent']||''),os=/Android/i.test(ua)?'Android':/iPhone|iPad/i.test(ua)?'iPhone / iPad':/Windows/i.test(ua)?'Windows':/Macintosh/i.test(ua)?'Mac':'Browser';
   const browser=os+' · '+(/Edg\//.test(ua)?'Edge':/Firefox\//.test(ua)?'Firefox':/Chrome\//.test(ua)?'Chrome':/Safari\//.test(ua)?'Safari':'PRIME');
   db.prepare('INSERT INTO authenticator_logins(id,nonce_hash,poll_hash,browser,match_code,created_at,expires_at) VALUES(?,?,?,?,?,?,?)').run(id,hash(nonce),hash(poll),browser,match,now(),expires);
   json(res,200,{id,poll_token:poll,match_code:match,expires_at:expires,...await qr('login',id,nonce)});return true;
  }
  if(action==='details'){
   limit(req,'details',100);const r=login(b);json(res,200,{origin:origin(),browser:r.browser,match_code:r.match_code,expires_at:r.expires_at,message:message(r,b.nonce)});return true;
  }
  if(action==='approve'){
   limit(req,'approve',50);const r=login(b),d=activeDevice(b.device_id);
   if(!d||typeof b.signature!=='string'||!/^[A-Za-z0-9_-]{86}$/.test(b.signature))fail(401,'Dispositivo non riconosciuto o revocato.');
   let good=false;try{good=verify('sha256',Buffer.from(message(r,b.nonce)),{key:createPublicKey({key:JSON.parse(d.public_key),format:'jwk'}),dsaEncoding:'ieee-p1363'},Buffer.from(b.signature,'base64url'));}catch{}
   if(!good)fail(401,'Conferma del dispositivo non valida.');
   const changed=db.prepare("UPDATE authenticator_logins SET status='approved',device_id=? WHERE id=? AND status='pending' AND expires_at>?").run(d.id,r.id,now());
   if(!changed.changes)fail(401,'QR già utilizzato.');
   audit({user_id:d.user_id,tenant_id:d.tenant_id},'auth.qr_approved',d.id);
   json(res,200,{ok:true});return true;
  }
  if(action==='poll'){
   if(!validToken(b.id)||!validToken(b.poll_token))fail(401,'Richiesta di accesso non valida.');
   const r=db.prepare('SELECT * FROM authenticator_logins WHERE id=? AND poll_hash=? AND expires_at>?').get(b.id,hash(b.poll_token),now());
   if(!r||r.status==='consumed')fail(401,'QR scaduto o già utilizzato.');
   if(r.status==='pending'){json(res,200,{pending:true,expires_at:r.expires_at});return true;}
   const d=activeDevice(r.device_id);if(!d)fail(403,'Il dispositivo è revocato o l’account non è disponibile.');
   if(!db.prepare("UPDATE authenticator_logins SET status='consumed' WHERE id=? AND status='approved'").run(r.id).changes)fail(401,'QR già utilizzato.');
   db.prepare('UPDATE authenticator_devices SET last_used_at=? WHERE id=?').run(now(),d.id);
   audit({user_id:d.user_id,tenant_id:d.tenant_id},'auth.qr_login',d.id);
   if(d.two_factor_policy==='all'&&factorMethods(d).length){json(res,200,{ok:true,...mfa.challenge(d,d.tenant_id)});return true;}
   createSession(res,d.user_id,d.tenant_id);json(res,200,{ok:true});return true;
  }
  if(action==='pair/submit'){
   limit(req,'pair',40);const p=pairing(b);if(p.status!=='new')fail(409,'Questo QR è già stato scansionato.');
   const k=b.public_key;if(!k||k.kty!=='EC'||k.crv!=='P-256'||typeof k.x!=='string'||typeof k.y!=='string'||k.d)fail(400,'Chiave pubblica non valida.');
   const clean={kty:'EC',crv:'P-256',x:k.x,y:k.y};let der;try{der=createPublicKey({key:clean,format:'jwk'}).export({type:'spki',format:'der'});}catch{fail(400,'Chiave pubblica non valida.');}
   const id=token(),fingerprint=hash(der.toString('base64')).slice(0,12).toUpperCase(),label=String(b.label||'PRIME Authenticator').trim().slice(0,80);
   db.prepare("UPDATE authenticator_pairings SET status='waiting',device_id=?,label=?,public_key=?,fingerprint=? WHERE id=? AND status='new'").run(id,label,JSON.stringify(clean),fingerprint,p.id);
   json(res,200,{device_id:id,fingerprint,status:'waiting',account:db.prepare('SELECT email FROM users WHERE id=?').get(p.user_id).email});return true;
  }
  if(action==='pair/status'){
   const p=pairing(b);json(res,200,{status:p.status,device_id:p.device_id,fingerprint:p.fingerprint,account:db.prepare('SELECT email FROM users WHERE id=?').get(p.user_id).email});return true;
  }
  fail(404,'Operazione QR non trovata.');
 }
 async function route(req,res,url,s){
  if(!url.pathname.startsWith('/api/account/security/devices'))return false;
  res.setHeader('Cache-Control','no-store');const action=url.pathname.slice('/api/account/security/devices'.length);
  if(req.method==='GET'&&action===''){json(res,200,{devices:db.prepare('SELECT id,label,fingerprint,created_at,last_used_at FROM authenticator_devices WHERE user_id=? AND tenant_id=? AND revoked_at IS NULL ORDER BY created_at DESC').all(s.user_id,s.tenant_id)});return true;}
  if(req.method==='GET'&&action==='/pair/status'){
   const p=db.prepare('SELECT status,device_id,label,fingerprint,expires_at FROM authenticator_pairings WHERE id=? AND user_id=? AND tenant_id=? AND expires_at>?').get(url.searchParams.get('id'),s.user_id,s.tenant_id,now());if(!p)fail(404,'Abbinamento scaduto.');json(res,200,p);return true;
  }
  if(req.method!=='POST')return false;
  const b=await readBody(req),u=await mfa.authorize(s,b);
  if(!u.email_verified)fail(403,'Verifica la tua email prima di abbinare un dispositivo.');
  if(action==='/pair'){
   if(db.prepare('SELECT count(*) n FROM authenticator_devices WHERE user_id=? AND revoked_at IS NULL').get(u.id).n>=20)fail(400,'Massimo 20 dispositivi. Revoca un dispositivo prima di continuare.');
   db.prepare("DELETE FROM authenticator_pairings WHERE user_id=? AND tenant_id=? AND status!='confirmed'").run(u.id,s.tenant_id);
   const id=token(),secret=token(),expires=now()+300000;
   db.prepare('INSERT INTO authenticator_pairings(id,token_hash,user_id,tenant_id,created_at,expires_at) VALUES(?,?,?,?,?,?)').run(id,hash(secret),u.id,s.tenant_id,now(),expires);
   json(res,200,{id,expires_at:expires,...await qr('pair',id,secret)});return true;
  }
  if(action==='/pair/confirm'){
   const p=db.prepare("SELECT * FROM authenticator_pairings WHERE id=? AND user_id=? AND tenant_id=? AND status='waiting' AND expires_at>?").get(b.id,u.id,s.tenant_id,now());
   if(!p||b.fingerprint!==p.fingerprint)fail(401,'Abbinamento non valido o scaduto.');
   db.exec('SAVEPOINT qr_pair');try{
    if(!db.prepare("UPDATE authenticator_pairings SET status='confirmed' WHERE id=? AND status='waiting'").run(p.id).changes)fail(401,'Abbinamento già utilizzato.');
    db.prepare('INSERT INTO authenticator_devices(id,user_id,tenant_id,label,public_key,fingerprint,created_at) VALUES(?,?,?,?,?,?,?)').run(p.device_id,u.id,s.tenant_id,p.label,p.public_key,p.fingerprint,now());db.exec('RELEASE qr_pair');
   }catch(e){db.exec('ROLLBACK TO qr_pair; RELEASE qr_pair');throw e;}
   audit(s,'auth.device_paired',p.device_id);json(res,200,{ok:true});return true;
  }
  if(action==='/revoke'){
   const r=db.prepare('UPDATE authenticator_devices SET revoked_at=? WHERE id=? AND user_id=? AND tenant_id=? AND revoked_at IS NULL').run(now(),b.device_id,u.id,s.tenant_id);if(!r.changes)fail(404,'Dispositivo non trovato.');audit(s,'auth.device_revoked',b.device_id);json(res,200,{ok:true});return true;
  }
  fail(404,'Operazione dispositivo non trovata.');
 }
 return {route,publicRoute};
}
