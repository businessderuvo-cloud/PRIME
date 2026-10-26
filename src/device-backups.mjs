import {backup,DatabaseSync} from 'node:sqlite';
import {randomBytes,randomUUID,createHash,createPublicKey,publicEncrypt,constants} from 'node:crypto';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,readdirSync,existsSync,lstatSync,rmSync,renameSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {openDatabase,transaction} from './database.mjs';
import {encryptBundle,verifyBackup} from './backups.mjs';
import {ApiError} from './validation.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
const ident=x=>'"'+x.replaceAll('"','""')+'"';
const DAY=86400000;
// Build a new single-agency DB. Never expose the full installation or live credentials.
export async function tenantSnapshot(db,tenantId,target) {
  const staging=target+'.source';await backup(db,staging);
  const source=new DatabaseSync(staging,{readOnly:true}),out=openDatabase(target);
  try {
    const names=source.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(x=>x.name);
    const omit=new Set(['migrations','users','tenants','sessions','auth_tokens','auth_challenges','integration_oauth_states','integration_settings','integration_jobs','datagma_settings','signature_provider_settings','signature_provider_links','contactout_settings','assistant_actions','import_previews','backup_pairings','backup_devices']);
    const rows=new Map();const tenant=source.prepare('SELECT * FROM tenants WHERE id=?').get(tenantId);if(!tenant)throw Error('Agenzia non trovata');rows.set('tenants',[tenant]);
    for(const name of names){if(omit.has(name))continue;const cols=source.prepare(`PRAGMA table_info(${ident(name)})`).all();if(cols.some(x=>x.name==='tenant_id'))rows.set(name,source.prepare(`SELECT * FROM ${ident(name)} WHERE tenant_id=?`).all(tenantId));}
    const connections=rows.get('integration_connections')||[];
    for(const c of connections){c.credentials_cipher='';c.sync_enabled=0;c.sync_token='';c.status='disconnected';c.last_error='Backup ripristinato: ricollega il provider';}
    for(const name of names){if(omit.has(name)||rows.has(name))continue;const cols=source.prepare(`PRAGMA table_info(${ident(name)})`).all();if(cols.some(x=>x.name==='connection_id'))rows.set(name,connections.flatMap(c=>source.prepare(`SELECT * FROM ${ident(name)} WHERE connection_id=?`).all(c.id)));}
    // Include only users referenced by this agency's rows. Passwords and TOTP never leave the server.
    const userIds=new Set();for(const [name,list]of rows){const refs=source.prepare(`PRAGMA foreign_key_list(${ident(name)})`).all().filter(x=>x.table==='users');for(const r of list)for(const ref of refs)if(r[ref.from])userIds.add(r[ref.from]);}
    rows.set('users',[...userIds].map(id=>source.prepare('SELECT * FROM users WHERE id=?').get(id)).filter(Boolean).map(u=>({...u,password:randomBytes(16).toString('hex')+':'+randomBytes(64).toString('hex'),totp_enabled:0,totp_secret_cipher:'',totp_pending_cipher:''})));
    out.exec('PRAGMA foreign_keys=OFF;BEGIN IMMEDIATE');
    try{for(const [name,list]of rows)for(const r of list){const keys=Object.keys(r);out.prepare(`INSERT INTO ${ident(name)}(${keys.map(ident).join(',')}) VALUES (${keys.map(()=>'?').join(',')})`).run(...Object.values(r));}if(out.prepare('PRAGMA foreign_key_check').get())throw Error('Relazioni non valide nel backup agenzia');out.exec('COMMIT');}catch(e){out.exec('ROLLBACK');throw e;}
    out.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  } finally {out.close();source.close();rmSync(staging,{force:true});}
}

export function deviceBackupService({db,database,readBody,json,audit,directory=process.env.PRIME_BACKUP_DIR,retention=Number(process.env.PRIME_BACKUP_RETENTION_DAYS||30)}) {
  const dataDir=database&&database!==':memory:'?path.dirname(path.resolve(database)):null;
  const root=dataDir?path.join(directory||path.join(dataDir,'backups'),'devices'):null;
  const inFlight=new Map(),attempts=new Map();
  const cleanDevice=d=>({id:d.id,label:d.label,created_at:d.created_at,last_download_at:d.last_download_at,last_saved_at:d.last_saved_at,last_error:d.last_error,revoked:!!d.revoked_at});
  async function snapshot(device){
    if(!root)throw new ApiError(503,'Archivio server persistente non disponibile');
    if(inFlight.has(device.id))return inFlight.get(device.id);
    const work=(async()=>{const folder=path.join(root,device.id);mkdirSync(folder,{recursive:true,mode:0o700});const names=()=>readdirSync(folder).filter(x=>/^prime-\d{13}\.prb2$/.test(x)).sort();let latest=names().at(-1);
      if(latest&&Date.now()-Number(latest.slice(6,19))<DAY)return {file:path.join(folder,latest),name:latest};
      const temp=mkdtempSync(path.join(tmpdir(),'prime-agency-backup-'));try {
        const target=path.join(temp,'prime.sqlite');await tenantSnapshot(db,device.tenant_id,target);
        const files=[];const add=(name,bytes)=>files.push({name,bytes,sha256:hash(bytes)});add('prime.sqlite',readFileSync(target));
        const tenantFolder=hash(device.tenant_id);
        const collect=(dir,relative)=>{if(!existsSync(dir))return;for(const name of readdirSync(dir)){const file=path.join(dir,name),stat=lstatSync(file);if(stat.isSymbolicLink())throw Error('Allegato simbolico non consentito');if(stat.isDirectory())collect(file,path.join(relative,name));else if(stat.isFile())add(path.join(relative,name),readFileSync(file));}};
        collect(path.join(dataDir,'uploads',tenantFolder),path.join('uploads',tenantFolder));
        const key=randomBytes(32),encrypted=encryptBundle({version:1,created_at:new Date().toISOString(),tenant_id:device.tenant_id,files},key);verifyBackup(encrypted,key);
        const wrapped=publicEncrypt({key:device.public_key,padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'},key);
        const header=Buffer.from(JSON.stringify({version:1,device_id:device.id,wrapped_key:wrapped.toString('base64')}));const size=Buffer.alloc(4);size.writeUInt32BE(header.length);
        latest=`prime-${Date.now()}.prb2`;const dest=path.join(folder,latest);writeFileSync(dest+'.partial',Buffer.concat([Buffer.from('PRD1'),size,header,encrypted]),{mode:0o600,flag:'wx'});renameSync(dest+'.partial',dest);
        for(const old of names().slice(0,-2))if(Number(old.slice(6,19))<Date.now()-retention*DAY)rmSync(path.join(folder,old));
        return {file:dest,name:latest};
      }finally{rmSync(temp,{recursive:true,force:true});}
    })().finally(()=>inFlight.delete(device.id));inFlight.set(device.id,work);return work;
  }
  async function publicRoute(req,res,url) {
    if(!url.pathname.startsWith('/api/backup-device/'))return false;
    if(url.pathname==='/api/backup-device/pair'&&req.method==='POST'){
      const ip=req.socket.remoteAddress,entry=attempts.get(ip)||{count:0,until:Date.now()+60000};if(entry.until<Date.now()){entry.count=0;entry.until=Date.now()+60000;}attempts.set(ip,entry);if(++entry.count>10)throw new ApiError(429,'Troppi tentativi: attendi un minuto');
      const b=await readBody(req);if(typeof b.code!=='string'||b.code.length>200||typeof b.public_key!=='string'||b.public_key.length>6000)throw new ApiError(400,'Collegamento non valido');
      let publicKey;try{publicKey=createPublicKey(b.public_key);if(publicKey.asymmetricKeyType!=='rsa'||publicKey.asymmetricKeyDetails.modulusLength<2048||publicKey.asymmetricKeyDetails.modulusLength>4096)throw Error();}catch{throw new ApiError(400,'Chiave dispositivo non valida');}
      const token=randomBytes(32).toString('hex'),id=randomUUID();
      transaction(db,()=>{const p=db.prepare('SELECT * FROM backup_pairings WHERE code_hash=? AND expires_at>?').get(hash(b.code),Date.now());if(!p)throw new ApiError(410,'Codice scaduto o già utilizzato');
        if(!db.prepare("SELECT 1 FROM memberships WHERE user_id=? AND tenant_id=? AND role='owner'").get(p.user_id,p.tenant_id))throw new ApiError(403,'Titolare non più abilitato');
        db.prepare('INSERT INTO backup_devices(id,tenant_id,user_id,label,token_hash,public_key,created_at) VALUES (?,?,?,?,?,?,?)').run(id,p.tenant_id,p.user_id,p.label,hash(token),publicKey.export({type:'spki',format:'pem'}),new Date().toISOString());db.prepare('DELETE FROM backup_pairings WHERE code_hash=?').run(hash(b.code));audit(p,'backup.device_paired',id);
      });json(res,201,{id,token,interval_hours:24});return true;
    }
    const token=/^Bearer ([a-f0-9]{64})$/.exec(req.headers.authorization||'')?.[1];
    const d=token?db.prepare("SELECT d.* FROM backup_devices d JOIN memberships m ON m.user_id=d.user_id AND m.tenant_id=d.tenant_id WHERE d.token_hash=? AND d.revoked_at IS NULL AND m.role='owner'").get(hash(token)):null;
    if(!d)throw new ApiError(401,'Dispositivo non autorizzato o disattivato');
    if(url.pathname==='/api/backup-device/snapshot'&&req.method==='GET'){
      const item=await snapshot(d);
      if(db.prepare('SELECT revoked_at FROM backup_devices WHERE id=?').get(d.id)?.revoked_at)throw new ApiError(401,'Dispositivo disattivato');
      const etag='"'+item.name+'"';if(req.headers['if-none-match']===etag){res.writeHead(304,{'Cache-Control':'no-store'});res.end();return true;}
      const bytes=readFileSync(item.file);db.prepare('UPDATE backup_devices SET last_download_at=? WHERE id=?').run(new Date().toISOString(),d.id);
      res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Length':bytes.length,'Content-Disposition':`attachment; filename="${item.name}"`,'Cache-Control':'no-store','ETag':etag});res.end(bytes);return true;
    }
    if(url.pathname==='/api/backup-device/ack'&&req.method==='POST'){
      const b=await readBody(req);if(b.ok!==true&&typeof b.error!=='string')throw new ApiError(400,'Esito non valido');
      db.prepare('UPDATE backup_devices SET last_saved_at=CASE WHEN ? THEN ? ELSE last_saved_at END,last_error=? WHERE id=?').run(b.ok?1:0,new Date().toISOString(),b.ok?'':String(b.error).slice(0,200),d.id);json(res,200,{ok:true});return true;
    }
    throw new ApiError(404,'Operazione non disponibile');
  }
  async function route(req,res,url,s) {
    if(!url.pathname.startsWith('/api/backups/devices'))return false;
    if(s.role!=='owner')throw new ApiError(403,'Copia PC riservata al titolare');
    if(url.pathname==='/api/backups/devices'&&req.method==='GET'){json(res,200,db.prepare('SELECT * FROM backup_devices WHERE tenant_id=? ORDER BY created_at DESC').all(s.tenant_id).map(cleanDevice));return true;}
    if(url.pathname==='/api/backups/devices/pairing'&&req.method==='POST'){
      if(!root)throw new ApiError(503,'Archivio server non disponibile');const b=await readBody(req);if(typeof b.label!=='string'||!b.label.trim()||b.label.length>100)throw new ApiError(400,'Assegna un nome al computer');
      const code=randomBytes(24).toString('base64url');db.prepare('DELETE FROM backup_pairings WHERE expires_at<? OR (tenant_id=? AND user_id=?)').run(Date.now(),s.tenant_id,s.user_id);db.prepare('INSERT INTO backup_pairings VALUES (?,?,?,?,?)').run(hash(code),s.tenant_id,s.user_id,b.label.trim(),Date.now()+600000);audit(s,'backup.pairing_created','');json(res,201,{code,expires_in_minutes:10});return true;
    }
    const m=/^\/api\/backups\/devices\/([a-f0-9-]+)$/.exec(url.pathname);
    if(m&&req.method==='DELETE'){const d=db.prepare('SELECT * FROM backup_devices WHERE id=? AND tenant_id=?').get(m[1],s.tenant_id);if(!d)throw new ApiError(404,'Computer non trovato');db.prepare('UPDATE backup_devices SET revoked_at=? WHERE id=?').run(new Date().toISOString(),d.id);audit(s,'backup.device_revoked',d.id);json(res,200,{ok:true});return true;}
    throw new ApiError(404,'Operazione non disponibile');
  }
  return {route,publicRoute};
}
