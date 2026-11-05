import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {schema} from '../public/schema.js';
import { demoSeasonalThemes } from '../public/seasonal-themes.js';
import {ApiError} from './validation.mjs';
import {baseApiAllowed} from '../public/edition.js';

const hash=x=>createHash('sha256').update(x).digest('hex');
export const customerDemoPlans=['standard','pro','vip','elite','secret'];
export const customerDemoEdition=plan=>({standard:'base',pro:'full',vip:'vip',elite:'elite',secret:'secret'})[plan];
const customerDemoThemeRanks=['standard','pro','vip','elite','secret'];
const customerDemoThemeOptions=plan=>['light',...customerDemoThemeRanks.slice(1,customerDemoThemeRanks.indexOf(plan)+1),...demoSeasonalThemes(plan).map(theme=>theme.id)];
const safeApi=p=>/^\/api\/(?:me|preferences|logout|customer-demo|entities|members|agents|dashboard|backups|search|audit|matching|map|media|documents|territory|imports|assistant|elite|connect|stripe|portals|signatures|contactout|integrations|billing\/status)(?:\/|$)/.test(p);
const deny=()=>{throw new ApiError(403,'Questa azione esterna non è disponibile nella demo clienti. Puoi lavorare sui dati dimostrativi; Vanessa è disponibile solo in chat da VIP in poi.');};
const wallesterDemoPlans=new Set(['pro','vip','elite','secret']);
const wallesterDemoAccounts=[
  {id:'demo-eur-main',name:'Conto operativo dimostrativo',currency_code:'EUR',balance:48250.75,available_amount:46120.25,blocked_amount:2130.5,status:'Active',is_main:true},
  {id:'demo-usd-travel',name:'Conto trasferte dimostrativo',currency_code:'USD',balance:3280,available_amount:3180,blocked_amount:100,status:'Active',is_main:false},
];
function wallesterDemoRecords(now=new Date()){
  const rows=[],samples=[
    ['income','Ricarica operativa dimostrativa','AccountAdjustment','Completed',2150],
    ['payments','Software gestionale dimostrativo','Transaction','Cleared',-189],
    ['pending','Autorizzazione carta dimostrativa','Authorization','Pending',-72.8],
    ['fees','Commissione mensile dimostrativa','Fee','Completed',-2.5],
    ['transfers','Bonifico fornitore dimostrativo','WireTransferPayout','Completed',-340],
    ['adjustments','Rettifica contabile dimostrativa','AccountAdjustment','Completed',-15],
  ];
  for(let monthOffset=11;monthOffset>=0;monthOffset--){
    const month=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()-monthOffset,1));
    for(let i=0;i<samples.length;i++){
      const [category,description,record_type,record_status,amount]=samples[i],date=new Date(Date.UTC(month.getUTCFullYear(),month.getUTCMonth(),4+i*3,12));
      rows.push({account_id:'demo-eur-main',account_name:'Conto operativo dimostrativo',record_id:'demo-eur-'+monthOffset+'-'+category,record_date:date.toISOString(),record_type,record_status,description,merchant_name:description,account_amount:amount,account_currency_code:'EUR',transaction_amount:amount,transaction_currency_code:'EUR',receipt:{available:false,reason:'Documento non presente nei dati dimostrativi.'},demo_category:category});
    }
    for(let i=0;i<2;i++){
      const date=new Date(Date.UTC(month.getUTCFullYear(),month.getUTCMonth(),12+i*10,12)),amount=i===0?-96.4:325;
      rows.push({account_id:'demo-usd-travel',account_name:'Conto trasferte dimostrativo',record_id:'demo-usd-'+monthOffset+'-'+i,record_date:date.toISOString(),record_type:i===0?'Transaction':'AccountAdjustment',record_status:'Completed',description:i===0?'Trasporto dimostrativo':'Ricarica trasferte dimostrativa',merchant_name:i===0?'Trasporto dimostrativo':'',account_amount:amount,account_currency_code:'USD',transaction_amount:amount,transaction_currency_code:'USD',receipt:{available:false,reason:'Documento non presente nei dati dimostrativi.'},demo_category:i===0?'payments':'income'});
    }
  }
  return rows.sort((a,b)=>b.record_date.localeCompare(a.record_date));
}

// This guard executes inside the isolated app after its own session and CSRF checks.
export async function customerDemoApi({req,res,url,s,db,config,json,readBody}){
  const p=url.pathname.replace(/^\/demo(?=\/)/,''),m=req.method,advanced=['vip','elite','secret'].includes(config.plan);
  if(p.includes('/api/elite/')){if(!advanced)throw new ApiError(403,'Vanessa è inclusa da VIP in poi. Seleziona VIP o Elite nella demo.');return false;}
  if(p==='/api/customer-demo/status'&&m==='GET'){
    json(res,200,{plan:config.plan,plans:customerDemoPlans,vanessa_chat:advanced});return true;
  }
  if(p==='/api/customer-demo/plan'&&m==='POST'){
    const b=await readBody(req);if(!customerDemoPlans.includes(b.plan))throw new ApiError(400,'Piano demo non valido.');
    config.plan=b.plan;config.theme_variant='';db.prepare('UPDATE users SET theme=? WHERE id=?').run(b.plan==='standard'?'light':'dark',s.user_id);json(res,200,{ok:true,plan:b.plan,edition:customerDemoEdition(b.plan)});return true;
  }
  if(config.plan==='standard'&&!baseApiAllowed(p))throw new ApiError(403,'Questa funzione è inclusa da PRIME Pro in poi. Cambia piano nella demo.');
  if(p==='/api/preferences'&&m==='PATCH'){
    const body=await readBody(req),keys=Object.keys(body);if(!keys.length||keys.some(key=>!['theme','theme_variant'].includes(key)))throw new ApiError(400,'Preferenza tema non valida.');
    let theme=body.theme??s.theme;if(!['dark','light'].includes(theme))throw new ApiError(400,'Tema non valido.');
    let variant=body.theme_variant===undefined?(theme==='light'?'':config.theme_variant||''):String(body.theme_variant||'');
    if(variant&&!customerDemoThemeOptions(config.plan).includes(variant))throw new ApiError(400,'Tema non incluso nel piano demo selezionato.');
    if(theme==='light'&&variant&&variant!=='light')throw new ApiError(400,'Selezione tema non coerente.');
    if(variant==='light')theme='light';if(theme==='light')variant='';config.theme_variant=variant;db.prepare('UPDATE users SET theme=? WHERE id=?').run(theme,s.user_id);json(res,200,{theme,theme_variant:variant});return true;
  }
  if(p==='/api/connect/wallester'&&m==='GET'&&wallesterDemoPlans.has(config.plan)){
    json(res,200,{configured:false,simulation:true,status:'simulation',account_label:'Wallester · dati dimostrativi',last_verified_at:'',last_synced_at:'Esempio aggiornato automaticamente',last_error:'',sync_status:'idle',sync_done:wallesterDemoRecords().length,sync_total:wallesterDemoRecords().length,accounts:wallesterDemoAccounts});return true;
  }
  if(p==='/api/connect/wallester/analytics'&&m==='GET'&&wallesterDemoPlans.has(config.plan)){
    const records=wallesterDemoRecords(),accountId=url.searchParams.get('account')||'',account=wallesterDemoAccounts.find(item=>item.id===accountId);
    if(accountId&&!account)throw new ApiError(404,'Conto dimostrativo non trovato.');
    const parsedMonths=Number.parseInt(url.searchParams.get('months')||'12',10),months=Math.max(3,Math.min(24,Number.isFinite(parsedMonths)?parsedMonths:12));
    const now=new Date(),start=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()-months+1,1));
    const currencies=[...new Set(wallesterDemoAccounts.filter(item=>!account||item.id===accountId).map(item=>item.currency_code))].sort();
    const requestedCurrency=url.searchParams.get('currency')||'',currency=currencies.includes(requestedCurrency)?requestedCurrency:account?.currency_code||currencies[0]||'EUR';
    const selected=records.filter(item=>(!accountId||item.account_id===accountId)&&item.account_currency_code===currency&&new Date(item.record_date)>=start);
    const series=Array.from({length:months},(_,index)=>{const date=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()-months+1+index,1));return {month:date.getUTCFullYear()+'-'+String(date.getUTCMonth()+1).padStart(2,'0'),income:0,payments:0,pending:0,fees:0,transfers:0,adjustments:0};});
    for(const item of selected){const date=new Date(item.record_date),month=date.getUTCFullYear()+'-'+String(date.getUTCMonth()+1).padStart(2,'0'),bucket=series.find(row=>row.month===month);if(bucket)bucket[item.demo_category]+=Math.abs(item.account_amount);}
    json(res,200,{accounts:wallesterDemoAccounts,currencies,currency,series,last_synced_at:new Date().toISOString(),sync_status:'idle',notice:'Dati Wallester interamente fittizi per la demo: nessun conto reale è collegato.'});return true;
  }
  if(p==='/api/connect/wallester/movements'&&m==='GET'&&wallesterDemoPlans.has(config.plan)){
    const records=wallesterDemoRecords(),accountId=url.searchParams.get('account')||'',account=wallesterDemoAccounts.find(item=>item.id===accountId);
    if(accountId&&!account)throw new ApiError(404,'Conto dimostrativo non trovato.');
    const parsedMonths=Number.parseInt(url.searchParams.get('months')||'12',10),months=Math.max(3,Math.min(24,Number.isFinite(parsedMonths)?parsedMonths:12));
    const parsedLimit=Number.parseInt(url.searchParams.get('limit')||'50',10),parsedOffset=Number.parseInt(url.searchParams.get('offset')||'0',10),limit=Math.max(1,Math.min(100,Number.isFinite(parsedLimit)?parsedLimit:50)),offset=Math.max(0,Number.isFinite(parsedOffset)?parsedOffset:0);
    const now=new Date(),start=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()-months+1,1)),currency=url.searchParams.get('currency')||account?.currency_code||'EUR';
    const filtered=records.filter(item=>(!accountId||item.account_id===accountId)&&item.account_currency_code===currency&&new Date(item.record_date)>=start),transactions=filtered.slice(offset,offset+limit);
    json(res,200,{transactions,total:filtered.length,limit,offset,next_offset:offset+transactions.length<filtered.length?offset+transactions.length:null});return true;
  }
  if(p.startsWith('/api/elite/')){
    if(!advanced)throw new ApiError(403,'Vanessa è inclusa da VIP in poi. Seleziona VIP o Elite nella demo.');
    // Vanessa's isolated demo workspace owns the full Elite panel API (Secret included). The
    // service still applies its normal plan and demoChatOnly guards.
    return false;
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
  // Map searches use the shared real-address geocoder; fictional coordinates are never invented.
  // The planner can read a free/busy calendar without linking a real account.
  if(['/api/connect/busy','/api/connect/mail-notifications'].includes(p)&&m==='GET'){json(res,200,[]);return true;}
  if(p==='/api/connect/mail/imap/connect/infomaniak'&&m==='POST')return false;
  if(/^\/api\/connect\/mail\/connections\/[^/]+\/sync$/.test(p)&&m==='POST')return false;
  if(/^\/api\/connect\/connections\/[^/]+$/.test(p)&&m==='DELETE')return false;
  const secretCloud=config.plan==='secret'&&/^(?:POST|PUT)$/.test(m)&&/^\/api\/connect\/storage\/(?:drive|onedrive|dropbox)\/(?:upload|sync|sync-now)$/.test(p);
  const secretOAuthStart=config.plan==='secret'&&m==='POST'&&/^\/api\/connect\/authorize\/(?:calendly|drive|dropbox|onedrive)$/.test(p);
  const secretDatagma=config.plan==='secret'&&((m==='PUT'&&p==='/api/connect/settings/datagma')||(m==='POST'&&['/api/connect/datagma/query','/api/connect/datagma/enrich'].includes(p)));
  if(/^\/api\/(?:connect|portals|signatures|contactout)(?:\/|$)/.test(p)&&m!=='GET'&&!/^\/api\/connect\/telephony\/telnyx$/.test(p)&&!(p==='/api/contactout/enrich'&&m==='POST')&&!secretOAuthStart&&!secretCloud&&!secretDatagma&&!(config.plan==='secret'&&m==='POST'&&p==='/api/contactout/query')&&!(config.plan==='secret'&&['POST','DELETE'].includes(m)&&/^\/api\/connect\/storage\/(drive|dropbox)\/folders$/.test(p)))deny();
  if(!safeApi(p))deny();
  return false;
}

export function seedDemoWorkspace(app,config,{email='visitatore@example.invalid',colleagueEmail='agente.demo@example.invalid',name='Agenzia Aurora · Demo clienti'}={}){
  const {db}=app,uid=randomUUID(),tid=randomUUID(),token=randomBytes(32).toString('hex'),csrf=randomBytes(32).toString('hex');
  db.prepare('INSERT INTO tenants(id,name) VALUES (?,?)').run(tid,name);
  db.prepare('INSERT INTO users(id,email,password,email_verified,theme) VALUES (?,?,?,1,?)').run(uid,email,'customer-demo-no-login',config.plan==='standard'?'light':'dark');
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

export function customerDemoService({createApp,root,production,json,readBody,geocode,capacity=16,ttl=7*60000,clock=Date.now}){
  const sessions=new Map();
  const expired=(entry, now=clock())=>entry.retired || now>=entry.expiresAt;
  const demoId=req=>/\bprime_customer_demo=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie||'')?.[1];
  const cookie=(id,seconds)=>'prime_customer_demo='+id+'; Path=/demo; HttpOnly; SameSite=Lax; Max-Age='+seconds+(production?'; Secure':'');
  const requestLimits={read:600,write:120,tools:120};
  function limit(entry, group, res){
    const now=clock(), previous=entry.budgets.get(group);
    const bucket=previous&&now<previous.resetAt?previous:{count:0,resetAt:now+60000};
    entry.budgets.set(group,bucket);
    if(bucket.count>=requestLimits[group]){
      const seconds=Math.max(1,Math.ceil((bucket.resetAt-now)/1000));
      res.setHeader('Retry-After',String(seconds));
      throw new ApiError(429,'Troppe richieste nella demo. Riprova tra '+seconds+' s.');
    }
    bucket.count++;
  }
  function dispose(entry){clearInterval(entry.mailExpiryTimer);entry.app.server.emit('close');entry.app.db.close();rmSync(entry.directory,{recursive:true,force:true});}
  function expire(){
    const now=clock();
    for(const [key,entry] of sessions){
      if(expired(entry,now)){
        if(!entry.active){sessions.delete(key);dispose(entry);}
        continue;
      }
      for(const [connectionId,deadline] of entry.mailConnections){
        if(now<deadline)continue;
        entry.app.db.prepare("DELETE FROM integration_connections WHERE id=? AND tenant_id=? AND provider='infomaniak'").run(connectionId,entry.config.session.tenant_id);
        entry.mailConnections.delete(connectionId);
      }
    }
  }
  const timer=setInterval(expire,1000);timer.unref();
  function create(){
    expire();if(sessions.size>=capacity)throw new ApiError(503,'La demo è momentaneamente al completo. Riprova tra qualche minuto.');
    const directory=mkdtempSync(path.join(tmpdir(),'prime-customer-demo-')),config={plan:'standard',theme_variant:''},id=randomBytes(32).toString('hex');
    let app;
    try{
      const offline=async()=>{throw new ApiError(403,'Collegamenti esterni non disponibili nella demo clienti.');};
      app=createApp({database:path.join(directory,'demo.sqlite'),production,demo:true,edition:'full',publicDemo:config,geocode,connectInterval:0,connectFetch:offline,assistantFetch:offline,assistantApiKey:'',authEmailApiKey:'',authEmailFetch:offline,authEmailFrom:''});
      const auth=seedDemoWorkspace(app,config),entry={app,config,directory,...auth,expiresAt:clock()+ttl,active:0,budgets:new Map(),uploaded:0,mailConnections:new Map()};
      sessions.set(hash(id),entry);return {id,entry};
    }catch(e){if(app){app.server.emit('close');app.db.close();}rmSync(directory,{recursive:true,force:true});throw e;}
  }
  async function route(req,res,url){
    if(url.pathname==='/api/elite/tools'&&req.method==='POST'){
      const token=req.headers['x-prime-session'];
      if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))return false;
      const digest=hash(token),now=Date.now();
      for(const entry of sessions.values()){
        if(entry.config.plan!=='secret'||expired(entry,now))continue;
        const access=entry.app.db.prepare("SELECT 1 FROM elite_access_tokens WHERE token_hash=? AND expires_at>? AND tenant_id=? AND user_id=? AND scope='workspace' AND agent_id='vanessa'").get(digest,now,entry.config.session.tenant_id,entry.config.session.user_id);
        if(!access)continue;
        limit(entry,'tools',res);
        entry.active++;
        try{await entry.app.server.listeners('request')[0](req,res);}
        finally{entry.active--;}
        return true;
      }
      return false;
    }
    const oauthBridge=/^\/api\/connect\/callback\/(calendly|drive|dropbox|onedrive|outlook)$/.exec(url.pathname);
    if(oauthBridge&&req.method==='GET'){
      const state=url.searchParams.get('state')||'',digest=state&&hash(state);
      if(digest){
        for(const entry of sessions.values()){
          if(entry.config.plan!=='secret'||expired(entry))continue;
          const bridgeProvider=oauthBridge[1]==='outlook'?'onedrive':oauthBridge[1],row=entry.app.db.prepare('SELECT 1 FROM integration_oauth_states WHERE state_hash=? AND provider=? AND expires_at>?').get(digest,bridgeProvider,Date.now());
          if(!row)continue;
          entry.active++;
          const oldUrl=req.url,oldCookie=req.headers.cookie;
          req.url=url.pathname+url.search;
          req.headers.cookie='prime_session='+entry.token;
          try{await entry.app.server.listeners('request')[0](req,res);}finally{req.url=oldUrl;if(oldCookie===undefined)delete req.headers.cookie;else req.headers.cookie=oldCookie;entry.active--;}
          return true;
        }
      }
    }
    if(url.pathname!=='/demo'&&!url.pathname.startsWith('/demo/'))return false;
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Robots-Tag','noindex, nofollow');
    if(url.pathname==='/demo'){res.writeHead(302,{Location:'/demo/'});res.end();return true;}
    if(url.pathname==='/demo/'&&req.method==='GET'){
      // The OAuth callbacks and the demo cookie must use the same host.
      const publicDemoUrl=production&&process.env.PRIME_DEMO_PUBLIC_URL;
      if(publicDemoUrl){
        const canonical=new URL(publicDemoUrl);
        if(canonical.protocol==='https:'&&String(req.headers.host||'').toLowerCase()!==canonical.host){
          res.writeHead(302,{Location:canonical.origin+'/demo/'+url.search});res.end();return true;
        }
      }
      const id=demoId(req);
      let entry=id&&sessions.get(hash(id));
      if(!entry||expired(entry)){
        const fresh=create();
        entry=fresh.entry;
        res.setHeader('Set-Cookie',cookie(fresh.id,Math.ceil(ttl/1000)));
      }
      const remaining=Math.max(0,entry.expiresAt-clock());
      res.setHeader('Permissions-Policy','microphone=(self), camera=(), display-capture=()');
      res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob: https://tile.openstreetmap.org; connect-src 'self' https://api.elevenlabs.io wss://api.elevenlabs.io; media-src 'self' blob:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
      const html=readFileSync(path.join(root,'public/index.html'),'utf8').replace('<title>PRIME · Real estate workspace</title>','<title>Demo clienti · PRIME</title>').replace('</head>','<link rel="stylesheet" href="/customer-demo.css?v=20261102-demo-theme-picker"><script src="/customer-demo-runtime.js?v=20261104-demo-7-minutes" data-remaining-ms="'+remaining+'"></script></head>');
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(html);return true;
    }
    if(url.pathname==='/demo/session/restart'&&req.method==='POST'){
      if(req.headers['x-prime-demo-restart']!=='1')throw new ApiError(403,'Riavvio della demo non autorizzato.');
      const id=demoId(req),entry=id&&sessions.get(hash(id));
      if(entry){entry.retired=true;expire();}
      res.setHeader('Set-Cookie',cookie('',0));
      json(res,200,{ok:true});return true;
    }
    if(!url.pathname.startsWith('/demo/api/'))throw new ApiError(404,'Pagina demo non trovata.');
    const id=demoId(req),entry=id&&sessions.get(hash(id));
    if(!entry||expired(entry))throw new ApiError(410,'La sessione demo è scaduta. Usa Riavvia demo per ricominciare.');
    const localPath=url.pathname.slice(5),secretOAuthCallback=entry.config.plan==='secret'&&req.method==='GET'&&/^\/api\/connect\/callback\/(?:calendly|drive|dropbox|onedrive)$/.test(localPath);if(!safeApi(localPath)||(/^\/api\/connect\/(?:callback|webhook)(?:\/|$)/.test(localPath)&&!secretOAuthCallback))deny();
    if(req.method!=='GET'&&req.headers['x-csrf-token']!==entry.csrf)throw new ApiError(403,'Sessione di sicurezza demo non valida.');
    limit(entry,req.method==='GET'?'read':'write',res);
    if(req.method!=='GET'){
      const length=Number(req.headers['content-length']||0);
      if(!String(req.headers['content-type']||'').startsWith('application/json')&&!req.headers['content-length'])throw new ApiError(411,'Indica la dimensione del file demo.');
      if(length>5*1024*1024||entry.uploaded+length>20*1024*1024)throw new ApiError(413,'Limite file della sessione demo raggiunto.');
      entry.uploaded+=length;
      if(entry.app.db.prepare('SELECT count(*) n FROM audit').get().n>1200)throw new ApiError(429,'Hai raggiunto il limite di modifiche di questa sessione demo.');
    }
    if(localPath==='/api/logout'){entry.config.plan='standard';res.setHeader('Set-Cookie',`prime_customer_demo=; Path=/demo; HttpOnly; SameSite=Lax; Max-Age=0${production?'; Secure':''}`);json(res,200,{ok:true});return true;}
    entry.active++;
    // Only the isolated app's private session is forwarded. Live cookies never cross this boundary.
    const oldUrl=req.url,oldCookie=req.headers.cookie;req.url=localPath+url.search;req.headers.cookie='prime_session='+entry.token;
    try{await entry.app.server.listeners('request')[0](req,res);if(req.method==='POST'&&localPath==='/api/connect/mail/imap/connect/infomaniak'&&res.statusCode>=200&&res.statusCode<300){for(const row of entry.app.db.prepare("SELECT id FROM integration_connections WHERE tenant_id=? AND provider='infomaniak' AND status='connected'").all(entry.config.session.tenant_id))entry.mailConnections.set(row.id,clock()+5*60000);}}finally{req.url=oldUrl;if(oldCookie===undefined)delete req.headers.cookie;else req.headers.cookie=oldCookie;entry.active--;}
    return true;
  }
  return {route,close(){clearInterval(timer);for(const e of sessions.values())dispose(e);sessions.clear();}};
}
