import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root=path.dirname(fileURLToPath(import.meta.url));
mkdirSync(path.join(root,'data'),{recursive:true});
const db=new DatabaseSync(process.env.PRIME_DB || path.join(root,'data/prime.sqlite'));
db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS tenants(id TEXT PRIMARY KEY,name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,password TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS memberships(user_id TEXT REFERENCES users(id),tenant_id TEXT REFERENCES tenants(id),role TEXT CHECK(role IN ('owner','admin','agent','viewer')),PRIMARY KEY(user_id,tenant_id));
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),tenant_id TEXT REFERENCES tenants(id),expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS records(id TEXT PRIMARY KEY,tenant_id TEXT REFERENCES tenants(id),kind TEXT NOT NULL,title TEXT NOT NULL,body TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS records_tenant_kind ON records(tenant_id,kind);
CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY,tenant_id TEXT,user_id TEXT,action TEXT,record_id TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);`);
const kinds=['streets','buildings','units','contacts','crm','properties','availability','visits','feedback','wps','pipeline','contracts','rentals'];
const attempts=new Map();
const digest=(p,s=randomBytes(16).toString('hex'))=>s+':'+scryptSync(p,s,64).toString('hex');
const verify=(p,h)=>{const [s,k]=h.split(':');return timingSafeEqual(Buffer.from(k,'hex'),scryptSync(p,s,64));};
function json(res,status,value){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));}
async function body(req){let raw='';for await(const c of req){raw+=c;if(raw.length>65536)throw Error('Richiesta troppo grande');}return JSON.parse(raw||'{}');}
function session(req){const token=/prime_session=([a-f0-9]+)/.exec(req.headers.cookie||'')?.[1];return db.prepare('SELECT s.*,m.role,t.name tenant_name,u.email FROM sessions s JOIN memberships m ON m.user_id=s.user_id AND m.tenant_id=s.tenant_id JOIN tenants t ON t.id=s.tenant_id JOIN users u ON u.id=s.user_id WHERE token=? AND expires>?').get(token||'',Date.now());}
const publicUser=s=>({email:s.email,tenant:s.tenant_name,role:s.role});
export const server=http.createServer(async(req,res)=>{try{
const url=new URL(req.url,'http://localhost');
res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
if(req.method!=='GET' && req.headers.origin && req.headers.origin!==`http://${req.headers.host}`)return json(res,403,{error:'Origine non consentita'});
if(url.pathname==='/api/auth' && req.method==='POST'){
 const key=req.socket.remoteAddress;const a=attempts.get(key)||{count:0,until:Date.now()+600000};if(a.until<Date.now()){a.count=0;a.until=Date.now()+600000;}if(++a.count>30)return json(res,429,{error:'Troppi tentativi. Riprova tra dieci minuti.'});attempts.set(key,a);
 const b=await body(req);const email=String(b.email||'').trim().toLowerCase();if(!/^\S+@\S+\.\S+$/.test(email)||typeof b.password!=='string'||b.password.length<12||b.password.length>128)return json(res,400,{error:'Email valida e password da 12 a 128 caratteri richieste.'});
 let user=db.prepare('SELECT * FROM users WHERE email=?').get(email);
 if(b.mode==='register'){
 if(user)return json(res,409,{error:'Indirizzo già registrato'});if(!String(b.agency||'').trim())return json(res,400,{error:'Inserisci il nome dell’agenzia'});
 const uid=randomUUID(),tid=randomUUID();db.exec('BEGIN');try{db.prepare('INSERT INTO tenants VALUES (?,?)').run(tid,String(b.agency).trim().slice(0,120));db.prepare('INSERT INTO users VALUES (?,?,?)').run(uid,email,digest(b.password));db.prepare('INSERT INTO memberships VALUES (?,?,?)').run(uid,tid,'owner');db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}user={id:uid};
 }else if(!user||!verify(b.password,user.password))return json(res,401,{error:'Credenziali non valide'});
 const membership=db.prepare('SELECT * FROM memberships WHERE user_id=?').get(user.id);const token=randomBytes(32).toString('hex');db.prepare('INSERT INTO sessions VALUES (?,?,?,?)').run(token,user.id,membership.tenant_id,Date.now()+86400000);res.setHeader('Set-Cookie',`prime_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400`);return json(res,200,{ok:true});
}
if(url.pathname.startsWith('/api/')){
 const s=session(req);if(!s)return json(res,401,{error:'Accedi per continuare'});
 if(url.pathname==='/api/me')return json(res,200,publicUser(s));
 if(url.pathname==='/api/logout'&&req.method==='POST'){db.prepare('DELETE FROM sessions WHERE token=?').run(s.token);res.setHeader('Set-Cookie','prime_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');return json(res,200,{ok:true});}
 if(url.pathname==='/api/records'&&req.method==='GET'){
 const kind=url.searchParams.get('kind'),q=(url.searchParams.get('q')||'').toLowerCase();const rows=db.prepare('SELECT * FROM records WHERE tenant_id=? ORDER BY created_at DESC').all(s.tenant_id).filter(r=>(!kind||r.kind===kind)&&(!q||(r.title+' '+r.body).toLowerCase().includes(q)));return json(res,200,rows.map(r=>({...r,body:JSON.parse(r.body)})));
 }
 if(url.pathname==='/api/records'&&req.method==='POST'){
 if(!['owner','admin','agent'].includes(s.role))return json(res,403,{error:'Ruolo in sola lettura'});const b=await body(req);if(!kinds.includes(b.kind)||!String(b.title||'').trim()||!b.body||typeof b.body!=='object')return json(res,400,{error:'Dati non validi'});
 for(const field of ['street_id','building_id','property_id','contact_id'])if(b.body[field]){const parent=db.prepare('SELECT * FROM records WHERE id=? AND tenant_id=?').get(b.body[field],s.tenant_id);const expected={street_id:'streets',building_id:'buildings',property_id:'properties',contact_id:'contacts'}[field];if(!parent||parent.kind!==expected)return json(res,400,{error:'Collegamento non valido'});}
 const id=randomUUID();db.prepare('INSERT INTO records(id,tenant_id,kind,title,body) VALUES (?,?,?,?,?)').run(id,s.tenant_id,b.kind,String(b.title).trim().slice(0,200),JSON.stringify(b.body));db.prepare('INSERT INTO audit(tenant_id,user_id,action,record_id) VALUES (?,?,?,?)').run(s.tenant_id,s.user_id,'create',id);return json(res,201,{id});
 }
 if(url.pathname.startsWith('/api/records/')&&req.method==='DELETE'){
 if(!['owner','admin'].includes(s.role))return json(res,403,{error:'Solo amministratori'});const id=url.pathname.split('/').pop();const children=db.prepare('SELECT body FROM records WHERE tenant_id=? AND id<>?').all(s.tenant_id,id);if(children.some(r=>Object.values(JSON.parse(r.body)).includes(id)))return json(res,409,{error:'Record collegato ad altri elementi'});const result=db.prepare('DELETE FROM records WHERE id=? AND tenant_id=?').run(id,s.tenant_id);return json(res,result.changes?200:404,{ok:!!result.changes});
 }return json(res,404,{error:'Operazione non disponibile'});
}
if(req.method!=='GET')return json(res,405,{error:'Metodo non consentito'});
const files={'/':'index.html','/app.js':'app.js','/style.css':'style.css','/assets/logo-light.png':'assets/logo-light.png','/assets/logo-dark.png':'assets/logo-dark.png'};const file=files[url.pathname];if(!file)return json(res,404,{error:'Non trovato'});const mime=file.endsWith('.png')?'image/png':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html';res.writeHead(200,{'Content-Type':mime+'; charset=utf-8'});res.end(readFileSync(path.join(root,'public',file)));
}catch(e){console.error(e.message);json(res,500,{error:'Operazione non riuscita'});}});
if(process.argv[1]===fileURLToPath(import.meta.url))server.listen(Number(process.env.PORT||4317),'127.0.0.1',()=>console.log('PRIME disponibile su http://127.0.0.1:'+(process.env.PORT||4317)));
