import {createHash, randomUUID} from 'node:crypto';
import {ApiError} from '../validation.mjs';
import {rawBody} from './store.mjs';

const drive = 'https://www.googleapis.com/drive/v3/files';
const driveUpload = 'https://www.googleapis.com/upload/drive/v3/files';
const graph = 'https://graph.microsoft.com/v1.0/me/drive';
const dropbox = 'https://content.dropboxapi.com/2/files';
const fileLimit = 5 * 1024 * 1024;
const interval = 5 * 60_000;
const fields = {
  properties: 'id, title, price, marketing_status, updated_at',
  contacts: 'id, title, email, phone, contact_type, do_not_contact, updated_at',
  appointments: 'id, title, starts_at, ends_at, status, updated_at',
  activities: 'id, title, activity_type, due_at, status, updated_at',
  documents: 'id, title, document_type, expires_on, status, updated_at',
};
const hash = value => createHash('sha256').update(value).digest('hex');
const segment = (value, pattern) => {
  if (!pattern.test(value)) throw new ApiError(400, 'Identificativo del file o della cartella non valido.');
  return encodeURIComponent(value);
};
const driveId = value => segment(value, /^[A-Za-z0-9_-]{1,256}$/);
const graphId = value => segment(value, /^[A-Za-z0-9!._-]{1,256}$/);
function dropboxPath(value) {
  if (value.length > 1024 || !/^(?:\/[^\x00-\x1f]+|id:[A-Za-z0-9_-]+)$/.test(value)) {
    throw new ApiError(400, 'Percorso Dropbox non valido.');
  }
  return value;
}
function fileName(value) {
  if (!value || value.length > 150 || /[<>:"/\\|?*\x00-\x1f]/.test(value) || /[. ]$/.test(value)) {
    throw new ApiError(400, 'Scegli un nome file valido, lungo al massimo 150 caratteri.');
  }
  return value;
}
const dropboxArg = value => JSON.stringify(value).replace(/[^\x20-\x7e]/g, char => '\\u' + char.charCodeAt(0).toString(16).padStart(4,'0'));

export function cloudStorage({db, credentials, editionFor, readBody, json, fetcher = fetch}) {
  const preferences = new Map();
  const active = new Set();
  const uploads = new Map();
  const account = db.prepare("SELECT * FROM integration_connections WHERE tenant_id=? AND user_id=? AND provider=? AND status='connected'");
  let closed = false;

  async function request(url, token, options = {}, accepted = []) {
    let response;
    try {
      response = await fetcher(url, {
        ...options, redirect: 'manual', signal: AbortSignal.timeout(20_000),
        headers: {...(token ? {Authorization: 'Bearer ' + token} : {}), ...options.headers},
      });
    } catch {
      throw new ApiError(502, 'Servizio cloud non raggiungibile.');
    }
    if (response.ok || accepted.includes(response.status)) return response;
    await response.body?.cancel();
    if ([401,403].includes(response.status)) throw new ApiError(403, 'Ricollega il servizio e autorizza l’accesso richiesto ai file.');
    if (response.status === 404) throw new ApiError(404, 'File o cartella non disponibile nel cloud.');
    throw new ApiError(502, 'Il servizio cloud ha restituito un errore (' + response.status + ').');
  }

  async function upload(provider, token, {name, parent, bytes, snapshot}) {
    if (provider === 'dropbox') {
      const path = (parent === 'root' ? '' : dropboxPath(parent)) + '/' + name;
      if (!path.startsWith('/')) throw new ApiError(400, 'Cartella Dropbox non valida.');
      const response = await request(dropbox + '/upload', token, {
        method: 'POST', body: bytes,
        headers: {'Content-Type': 'application/octet-stream', 'Dropbox-API-Arg': dropboxArg({path, mode:snapshot?'overwrite':'add', autorename:!snapshot})},
      });
      return response.json();
    }
    if (provider === 'onedrive') {
      const folder = parent === 'root' ? graph + '/root' : graph + '/items/' + graphId(parent);
      const conflict = snapshot ? 'replace' : 'rename';
      const response = await request(folder + ':/' + encodeURIComponent(name) + ':/content?@microsoft.graph.conflictBehavior=' + conflict, token, {
        method:'PUT', body:bytes, headers:{'Content-Type':'application/octet-stream'},
      });
      return response.json();
    }
    const metadata = {name};
    if (parent !== 'root') metadata.parents = [decodeURIComponent(driveId(parent))];
    if (snapshot && !snapshot.remoteId) {
      const response = await request(drive + '/generateIds?count=1&space=drive', token);
      snapshot.remoteId = (await response.json()).ids?.[0];
      if (!snapshot.remoteId) throw new ApiError(502, 'Google Drive non ha riservato un identificativo.');
    }
    if (snapshot) metadata.id = snapshot.remoteId;
    const boundary = 'prime-' + randomUUID();
    const body = Buffer.concat([
      Buffer.from('--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+JSON.stringify(metadata)+'\r\n--'+boundary+'\r\nContent-Type: application/octet-stream\r\n\r\n'),
      bytes, Buffer.from('\r\n--'+boundary+'--\r\n'),
    ]);
    const headers = {'Content-Type': 'multipart/related; boundary=' + boundary};
    const created = await request(driveUpload+'?uploadType=multipart',token,{method:'POST',body,headers},snapshot?[409]:[]);
    if (created.status !== 409) return created.json();
    await created.body?.cancel();
    const updated = await request(driveUpload+'/'+driveId(snapshot.remoteId)+'?uploadType=media',token,{
      method:'PATCH',body:bytes,headers:{'Content-Type':'application/octet-stream'},
    });
    return updated.json();
  }

  async function download(provider, token, id, format) {
    if (provider === 'dropbox') {
      return request(dropbox + '/download',token,{method:'POST',headers:{'Dropbox-API-Arg':dropboxArg({path:dropboxPath(id)})}});
    }
    if (provider === 'drive') {
      const url = drive+'/'+driveId(id);
      return request(url+(format==='pdf'?'/export?mimeType=application%2Fpdf':'?alt=media'),token);
    }
    const response = await request(graph+'/items/'+graphId(id)+'/content',token,{},[302]);
    if (response.status !== 302) return response;
    const location = new URL(response.headers.get('location') || 'about:blank');
    await response.body?.cancel();
    if (location.protocol !== 'https:' || location.username || location.password || location.port ||
        !/(?:^|\.)(?:sharepoint\.com|sharepoint-df\.com|1drv\.com|onedrive\.live\.com)$/.test(location.hostname)) {
      throw new ApiError(502, 'Indirizzo di download OneDrive non riconosciuto.');
    }
    return request(location.href);
  }

  function view(setting) {
    return {included:setting?.included||[], enabled:!!setting?.enabled,
      last_sync_at:setting?.lastSync||'', error:setting?.error||'', categories:Object.keys(fields)};
  }

  async function sync(s, c, setting) {
    if (active.has(c.id)) throw new ApiError(409, 'Sincronizzazione in corso.');
    active.add(c.id);
    setting.next = Date.now() + interval;
    try {
      const records = Object.fromEntries(setting.included.map(table => [
        table,db.prepare('SELECT '+fields[table]+' FROM '+table+' WHERE tenant_id=? ORDER BY id').all(s.tenant_id),
      ]));
      const bytes = Buffer.from(JSON.stringify({source:'PRIME Demo Secret',schema:1,records},null,2));
      if (bytes.length > fileLimit) throw new ApiError(413, 'Esportazione troppo grande. Riduci le categorie incluse.');
      const digest = hash(bytes);
      const creds = await credentials(c);
      if (closed || editionFor(s)!=='secret' || account.get(s.tenant_id,s.user_id,c.provider)?.id!==c.id) return;
      if (!creds.cloud_write || !creds.cloud_subject || setting.subject !== creds.cloud_subject) {
        setting.enabled = false;
        throw new ApiError(409, 'Account o permessi cambiati. Conferma nuovamente le categorie da sincronizzare.');
      }
      if (setting.digest !== digest) {
        await upload(c.provider,creds.access_token,{name:'PRIME-Demo-'+c.id+'.json',parent:'root',bytes,snapshot:setting});
        setting.digest = digest;
      }
      setting.lastSync = new Date().toISOString();
      setting.error = '';
    } catch (error) {
      setting.error = error instanceof ApiError ? error.message : 'Sincronizzazione non riuscita.';
      throw error;
    } finally {
      active.delete(c.id);
    }
  }

  const timer = setInterval(() => {
    for (const [id,setting] of preferences) {
      if (!setting.enabled || active.has(id) || Date.now()<setting.next) continue;
      const {session:s,provider} = setting;
      if (editionFor(s)!=='secret') { setting.enabled=false; continue; }
      const c = account.get(s.tenant_id,s.user_id,provider);
      if (c?.id!==id) { preferences.delete(id); continue; }
      void sync(s,c,setting).catch(()=>{});
    }
  }, 15_000);
  timer.unref();

  async function route(req,res,url,s) {
    const match = /^\/api\/connect\/storage\/(drive|onedrive|dropbox)\/(upload|download|sync|sync-now|folders)$/.exec(url.pathname);
    if (!match) return false;
    if (editionFor(s)!=='secret' || !['owner','manager'].includes(s.role)) throw new ApiError(403, 'Operazione riservata ai gestori della demo Secret.');
    const [,provider,action] = match;
    const c = account.get(s.tenant_id,s.user_id,provider);
    if (!c) throw new ApiError(404, 'Collega prima questo servizio di archiviazione.');
    const method = req.method;
    let setting = preferences.get(c.id);
    if (action==='sync' && method==='GET') json(res,200,view(setting));
    else if (action==='sync' && method==='PUT') {
      const {included,enabled} = await readBody(req);
      if (typeof enabled!=='boolean' || !Array.isArray(included) || included.length>Object.keys(fields).length ||
          included.some(key=>typeof key!=='string'||!Object.hasOwn(fields,key)) || (enabled && !included.length)) {
        throw new ApiError(400, 'Scegli le categorie da includere nella sincronizzazione.');
      }
      if (active.has(c.id)) throw new ApiError(409, 'Attendi la fine della sincronizzazione.');
      // Reserve the connection while reading or refreshing credentials.
      active.add(c.id);
      try {
        const creds = enabled ? await credentials(c) : null;
        const subject = creds?.cloud_subject || setting?.subject;
        if (enabled && (!creds.cloud_subject || !creds.cloud_write)) throw new ApiError(409, 'Autorizza trasferimenti e sincronizzazione prima di attivarla.');
        const previous = setting?.subject===subject ? setting : null;
        setting = {...previous,session:s,provider,subject,included:[...new Set(included)],enabled,next:Date.now()};
        preferences.set(c.id,setting);
      } finally { active.delete(c.id); }
      if (setting.enabled) await sync(s,c,setting);
      json(res,200,view(setting));
    } else if (action==='sync-now' && method==='POST') {
      if (!setting?.enabled) throw new ApiError(409, 'Attiva la sincronizzazione prima di avviarla.');
      if (active.has(c.id)) throw new ApiError(409, 'Sincronizzazione in corso.');
      setting.digest = '';
      await sync(s,c,setting);
      json(res,200,view(setting));
    } else if (action==='folders' && ['drive','dropbox','onedrive'].includes(provider) && ['POST','DELETE'].includes(method)) {
      const body=await readBody(req), creds=await credentials(c), token=creds.access_token;
      if(!creds.cloud_write)throw new ApiError(409,'Autorizza i trasferimenti prima di gestire le cartelle.');
      const headers={'Content-Type':'application/json'};
      const dropboxFolder=async(path,payload)=>request('https://api.dropboxapi.com/2/files/'+path,token,{method:'POST',headers,body:JSON.stringify(payload)});
      const mimeType='application/vnd.google-apps.folder';
      if(method==='POST'){
        const name=fileName(typeof body.name==='string'?body.name:''), parent=String(body.parent||'root');
        if(provider==='drive')await request(drive,token,{method:'POST',headers,body:JSON.stringify({name,mimeType,parents:[driveId(parent)]})});
        else if(provider==='dropbox')await dropboxFolder('create_folder_v2',{path:(parent==='root'?'':dropboxPath(parent))+'/'+name,autorename:false});
        else {const url=parent==='root'?graph+'/root/children':graph+'/items/'+graphId(parent)+'/children';await request(url,token,{method:'POST',headers,body:JSON.stringify({name,folder:{},'@microsoft.graph.conflictBehavior':'fail'})});}
      } else {
        const id=String(body.id||'');
        if(provider==='drive'){
          const url=drive+'/'+driveId(id), item=await (await request(url+'?fields=mimeType,capabilities(canTrash),id',token)).json();
          if(id==='root'||item.mimeType!==mimeType||!item.capabilities?.canTrash)throw new ApiError(403,'La cartella non può essere spostata nel cestino.');
          await request(url,token,{method:'PATCH',headers,body:JSON.stringify({trashed:true})});
        } else if(provider==='dropbox') {
          const path=dropboxPath(id), item=await (await dropboxFolder('get_metadata',{path})).json();
          if(item['.tag']!=='folder')throw new ApiError(400,'Seleziona una cartella.');
          await dropboxFolder('delete_v2',{path:item.id});
        } else {
          const item=await (await request(graph+'/items/'+graphId(id)+'?$select=id,folder',token)).json();
          if(!item.folder)throw new ApiError(400,'Seleziona una cartella.');
          await request(graph+'/items/'+graphId(id),token,{method:'DELETE'},[204]);
        }
      }
      json(res,200,{ok:true});
    } else if (action==='upload' && method==='POST') {
      const name = fileName(url.searchParams.get('name'));
      const parent = url.searchParams.get('parent') || 'root';
      const bytes = await rawBody(req,fileLimit);
      const uploadId = url.searchParams.get('upload_id');
      if (!/^[a-f0-9-]{36}$/.test(uploadId||'')) throw new ApiError(400,'Identificativo di caricamento mancante.');
      const key = c.id+':'+uploadId;
      let pending = uploads.get(key);
      if (!pending) {
        if (uploads.size>=120) throw new ApiError(429,'Limite di caricamenti per la sessione demo raggiunto.');
        pending = (async()=>{
          const creds = await credentials(c);
          if (!creds.cloud_write) throw new ApiError(409,'Autorizza trasferimenti e sincronizzazione prima di caricare un file.');
          return upload(provider,creds.access_token,{name,parent,bytes,snapshot:null});
        })();
        uploads.set(key,pending);
        pending.catch(()=>uploads.delete(key));
      }
      json(res,200,{name:(await pending).name||name});
    } else if (action==='download' && method==='GET') {
      const id = url.searchParams.get('id') || '';
      const name = (url.searchParams.get('name') || 'file').slice(0,150).replace(/[\uD800-\uDFFF]/gu,'_');
      const creds = await credentials(c);
      const response = await download(provider,creds.access_token,id,url.searchParams.get('format'));
      const chunks = [];
      let length = 0;
      for await (const chunk of response.body || []) {
        length += chunk.length;
        if (length>fileLimit) throw new ApiError(413,'La demo consente di scaricare file fino a 5 MB.');
        chunks.push(chunk);
      }
      res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(name).replace(/['()]/g,c=>'%'+c.charCodeAt(0).toString(16)),'Cache-Control':'no-store'});
      res.end(Buffer.concat(chunks));
    } else throw new ApiError(405,'Metodo non consentito.');
    return true;
  }
  return {route,close(){closed=true;clearInterval(timer);}};
}
