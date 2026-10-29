import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {schema} from '../public/schema.js';
import {ApiError} from './validation.mjs';
import {baseApiAllowed} from '../public/edition.js';

const hash=x=>createHash('sha256').update(x).digest('hex');
export const customerDemoPlans=['standard','pro','vip','elite','secret'];
export const customerDemoEdition=plan=>({standard:'base',pro:'full',vip:'vip',elite:'elite',secret:'elite'})[plan];
const safeApi=p=>/^\/api\/(?:me|preferences|logout|customer-demo|entities|members|agents|dashboard|backups|search|audit|matching|map|media|documents|territory|imports|assistant|elite|connect|portals|signatures|contactout|integrations|billing\/status)(?:\/|$)/.test(p);
const deny=()=>{throw new ApiError(403,'Questa azione esterna non è disponibile nella demo clienti. Puoi lavorare sui dati dimostrativi; Vanessa è disponibile solo in chat da VIP in poi.');};

// This guard executes inside the isolated app after its own session and CSRF checks.
export async function customerDemoApi({req,res,url,s,db,config,json,readBody}){
  const p=url.pathname,m=req.method,advanced=['vip','elite','secret'].includes(config.plan);
  if(p==='/api/customer-demo/status'&&m==='GET'){
    json(res,200,{plan:config.plan,plans:customerDemoPlans,vanessa_chat:advanced});return true;
  }
  if(p==='/api/customer-demo/plan'&&m==='POST'){
    const b=await readBody(req);if(!customerDemoPlans.includes(b.plan))throw new ApiError(400,'Piano demo non valido.');
    config.plan=b.plan;json(res,200,{ok:true,plan:b.plan,edition:customerDemoEdition(b.plan)});return true;
  }
  if(config.plan==='standard'&&!baseApiAllowed(p))throw new ApiError(403,'Questa funzione è inclusa da PRIME Pro in poi. Cambia piano nella demo.');
  if(p.startsWith('/api/elite/')){
    if(!advanced)throw new ApiError(403,'Vanessa è inclusa da VIP in poi. Seleziona VIP o Elite nella demo.');
    if((p==='/api/elite/session'||p==='/api/elite/conversations')&&m==='POST')return false;
    deny();
  }
  if(p.startsWith('/api/assistant/')&&!['/api/assistant/status','/api/assistant/chat'].includes(p))deny();
  if(p==='/api/agents'&&m==='POST'){
    const b=await readBody(req),email=String(b.email||'').trim().toLowerCase();
    if(!/^\S+@\S+\.\S+$/.test(email)||email.length>254)throw new ApiError(400,'Inserisci un’email di esempio valida.');
    const limit=config.plan==='standard'?2:config.plan==='pro'?10:Infinity;
    if(db.prepare('SELECT count(*) n FROM memberships WHERE tenant_id=?').get(s.tenant_id).n>=limit)throw new ApiError(403,`Il piano selezionato include ${limit} agenti umani, titolare compreso.`);
    const id=randomUUID();db.prepare('INSERT INTO users(id,email,password,email_verified) VALUES (?,?,?,1)').run(id,email,'customer-demo-no-login');
    db.prepare("INSERT INTO memberships VALUES (?,?,'agent')").run(id,s.tenant_id);
    json(res,201,{id,email,role:'agent',invitation_pending:false,demo:true});return true;
  }
  if(p==='/api/map/geocode'&&m==='GET'){
    const q=(url.searchParams.get('q')||'').toLowerCase();
    const rows=db.prepare('SELECT title,city FROM streets WHERE tenant_id=?').all(s.tenant_id);
    json(res,200,rows.filter(r=>(r.title+' '+r.city).toLowerCase().includes(q)||q.includes(r.city.toLowerCase())).map((r,i)=>({latitude:45.4642+i*.003,longitude:9.19+i*.003,label:r.title+', '+r.city+' · indirizzo demo'})));return true;
  }
  // The planner can read a free/busy calendar without linking a real account.
  if(['/api/connect/busy','/api/connect/mail-notifications'].includes(p)&&m==='GET'){json(res,200,[]);return true;}
  if(/^\/api\/(?:connect|portals|signatures|contactout)(?:\/|$)/.test(p)&&m!=='GET'&&!/^\/api\/connect\/telephony\/(?:zadarma|cloudtalk)$/.test(p))deny();
  if(!safeApi(p))deny();
  return false;
}

export function seedDemoWorkspace(app,config,{email='visitatore@example.invalid',colleagueEmail='agente.demo@example.invalid',name='Agenzia Aurora · Demo clienti'}={}){
  const {db}=app,uid=randomUUID(),tid=randomUUID(),token=randomBytes(32).toString('hex'),csrf=randomBytes(32).toString('hex');
  db.prepare('INSERT INTO tenants VALUES (?,?)').run(tid,name);
  db.prepare('INSERT INTO users(id,email,password,email_verified,theme) VALUES (?,?,?,1,?)').run(uid,email,'customer-demo-no-login','dark');
  db.prepare("INSERT INTO memberships VALUES (?,?,'owner')").run(uid,tid);
  db.prepare('INSERT INTO sessions(token,user_id,tenant_id,expires,csrf) VALUES (?,?,?,?,?)').run(hash(token),uid,tid,Date.now()+2*3600000,csrf);
  const colleague=randomUUID();db.prepare('INSERT INTO users(id,email,password,email_verified) VALUES (?,?,?,1)').run(colleague,colleagueEmail,'customer-demo-no-login');
  db.prepare("INSERT INTO memberships VALUES (?,?,'agent')").run(colleague,tid);
  const s={user_id:uid,tenant_id:tid,role:'owner'},refs={members:uid};
  const day=new Date(Date.now()+86400000).toISOString().slice(0,10),at=h=>day+'T'+h+':00';
  function add(entity,data){
    data={notes:'Dati interamente fittizi per la demo clienti.',...data};
    data=Object.fromEntries(Object.entries(data).filter(([k])=>schema[entity].fields[k]));
    for(const [k,f] of Object.entries(schema[entity].fields))if(f.required&&data[k]===undefined){
      if(f.type==='ref')data[k]=refs[f.entity];
      else if(f.type==='datetime-local')data[k]=at(/end|finish|due/.test(k)?'11:00':'10:00');
      else if(f.type==='date')data[k]=day;
      else if(f.type==='number')data[k]=1;
      else if(f.options)data[k]=f.options[0];
      else data[k]='Esempio demo';
    }
    const row=app.demoSave(entity,data,s);refs[entity]??=row.id;return row;
  }
  const street=add('streets',{title:'Via delle Magnolie',city:'Milano',district:'Porta Romana',census_status:'parziale'});
  add('streets',{title:'Corso delle Camelie',city:'Milano',district:'Città Studi'});
  const building=add('buildings',{title:'24',street_id:street.id,concierge_name:'Portineria dimostrativa'});
  const contact=add('contacts',{title:'Giulia Esempio',email:'giulia@example.invalid',role:'proprietario'});
  add('contacts',{title:'Luca Dimostrativo',email:'luca@example.invalid'});
  add('contacts',{title:'Martina Acquirente',email:'martina@example.invalid'});
  const unit=add('units',{title:'Interno 5',building_id:building.id,floor:'2',area:92,rooms:3,is_hot_lead:1});
  add('units',{title:'Interno 8',building_id:building.id,floor:'3',area:68,rooms:2});
  add('unit_contacts',{title:'Proprietaria demo',unit_id:unit.id,contact_id:contact.id});
  const property=add('properties',{title:'Trilocale luminoso · Porta Romana',unit_id:unit.id,owner_id:contact.id,asking_price:385000,area:92,rooms:3});
  add('properties',{title:'Bilocale con balcone · Città Studi',asking_price:249000,area:68,rooms:2});
  add('properties',{title:'Quadrilocale con terrazzo',asking_price:520000,area:125,rooms:4});
  add('activities',{title:'Preparare visita al trilocale',starts_at:at('09:00'),due_at:at('10:00'),agent_id:uid,contact_id:contact.id,property_id:property.id});
  add('activities',{title:'Aggiornare la scheda proprietaria',starts_at:at('14:00'),due_at:at('15:00'),agent_id:uid,contact_id:contact.id});
  add('appointments',{title:'Visita dimostrativa · trilocale',agent_id:uid,contact_id:contact.id,property_id:property.id,starts_at:at('11:00'),ends_at:at('12:00')});
  for(const entity of ['buyer_profiles','deals','offers','valuations','leases','commissions','documents'])add(entity,{title:({buyer_profiles:'Ricerca trilocale per famiglia',deals:'Trattativa dimostrativa',offers:'Proposta dimostrativa',valuations:'Valutazione trilocale',leases:'Locazione dimostrativa',commissions:'Provvigione dimostrativa',documents:'Documento di esempio · da caricare'})[entity]});
  config.session=s;return {token,csrf};
}

export function customerDemoService({createApp,root,production,json,readBody,capacity=16,ttl=30*60000}){
  const sessions=new Map();
  function dispose(entry){entry.app.server.emit('close');entry.app.db.close();rmSync(entry.directory,{recursive:true,force:true});}
  function expire(){for(const [key,e] of sessions)if(Date.now()-e.used>ttl&&!e.active){sessions.delete(key);dispose(e);}}
  const timer=setInterval(expire,60000);timer.unref();
  function create(){
    expire();if(sessions.size>=capacity)throw new ApiError(503,'La demo è momentaneamente al completo. Riprova tra qualche minuto.');
    const directory=mkdtempSync(path.join(tmpdir(),'prime-customer-demo-')),config={plan:'standard'},id=randomBytes(32).toString('hex');
    let app;
    try{
      const offline=async()=>{throw new ApiError(403,'Collegamenti esterni non disponibili nella demo clienti.');};
      app=createApp({database:path.join(directory,'demo.sqlite'),production,demo:true,edition:'full',publicDemo:config,connectInterval:0,connectFetch:offline,assistantFetch:offline,assistantApiKey:'',authEmailApiKey:'',authEmailFetch:offline,authEmailFrom:''});
      const auth=seedDemoWorkspace(app,config),entry={app,config,directory,...auth,used:Date.now(),active:0,requests:0,window:Date.now(),uploaded:0};
      sessions.set(hash(id),entry);return {id,entry};
    }catch(e){if(app){app.server.emit('close');app.db.close();}rmSync(directory,{recursive:true,force:true});throw e;}
  }
  async function route(req,res,url){
    if(url.pathname!=='/demo'&&!url.pathname.startsWith('/demo/'))return false;
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Robots-Tag','noindex, nofollow');
    if(url.pathname==='/demo'){res.writeHead(302,{Location:'/demo/'});res.end();return true;}
    if(url.pathname==='/demo/'&&req.method==='GET'){
      const prior=/\bprime_customer_demo=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie||'')?.[1];
      let entry=prior&&sessions.get(hash(prior));
      if(!entry||Date.now()-entry.used>ttl){const fresh=create();entry=fresh.entry;res.setHeader('Set-Cookie',`prime_customer_demo=${fresh.id}; Path=/demo; HttpOnly; SameSite=Strict; Max-Age=1800${production?'; Secure':''}`);}
      entry.used=Date.now();
      res.setHeader('Permissions-Policy','microphone=(self), camera=(), display-capture=()');
      res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob: https://tile.openstreetmap.org; connect-src 'self'; media-src 'self' blob:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
      const html=readFileSync(path.join(root,'public/index.html'),'utf8').replace('<title>PRIME · Real estate workspace</title>','<title>Demo clienti · PRIME</title>').replace('</head>','<link rel="stylesheet" href="/customer-demo.css"><script src="/customer-demo-runtime.js"></script></head>');
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(html);return true;
    }
    if(!url.pathname.startsWith('/demo/api/'))throw new ApiError(404,'Pagina demo non trovata.');
    const id=/\bprime_customer_demo=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie||'')?.[1],entry=id&&sessions.get(hash(id));
    if(!entry||Date.now()-entry.used>ttl)throw new ApiError(410,'La sessione demo è scaduta. Riapri la demo dal menu del sito.');
    const localPath=url.pathname.slice(5);if(!safeApi(localPath)||(localPath.startsWith('/api/elite/')&&!['/api/elite/session','/api/elite/conversations'].includes(localPath))||/^\/api\/connect\/(?:callback|webhook)(?:\/|$)/.test(localPath))deny();
    if(req.method!=='GET'&&req.headers['x-csrf-token']!==entry.csrf)throw new ApiError(403,'Sessione di sicurezza demo non valida.');
    if(Date.now()-entry.window>60000){entry.window=Date.now();entry.requests=0;}
    if(++entry.requests>240)throw new ApiError(429,'Troppe richieste nella demo. Attendi un minuto.');
    if(req.method!=='GET'){
      const length=Number(req.headers['content-length']||0);
      if(!String(req.headers['content-type']||'').startsWith('application/json')&&!req.headers['content-length'])throw new ApiError(411,'Indica la dimensione del file demo.');
      if(length>5*1024*1024||entry.uploaded+length>20*1024*1024)throw new ApiError(413,'Limite file della sessione demo raggiunto.');
      entry.uploaded+=length;
      if(entry.app.db.prepare('SELECT count(*) n FROM audit').get().n>1200)throw new ApiError(429,'Hai raggiunto il limite di modifiche di questa sessione demo.');
    }
    if(localPath==='/api/logout'){res.setHeader('Set-Cookie',`prime_customer_demo=; Path=/demo; HttpOnly; SameSite=Strict; Max-Age=0${production?'; Secure':''}`);json(res,200,{ok:true});return true;}
    entry.used=Date.now();entry.active++;
    // Only the isolated app's private session is forwarded. Live cookies never cross this boundary.
    const oldUrl=req.url,oldCookie=req.headers.cookie;req.url=localPath+url.search;req.headers.cookie='prime_session='+entry.token;
    try{await entry.app.server.listeners('request')[0](req,res);}finally{req.url=oldUrl;if(oldCookie===undefined)delete req.headers.cookie;else req.headers.cookie=oldCookie;entry.active--;}
    return true;
  }
  return {route,close(){clearInterval(timer);for(const e of sessions.values())dispose(e);sessions.clear();}};
}
