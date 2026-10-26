import {backup,DatabaseSync} from 'node:sqlite';
import {randomBytes,createCipheriv,createDecipheriv,createHash} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync,readdirSync,renameSync,rmSync,existsSync,lstatSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {gzipSync,gunzipSync} from 'node:zlib';
import {serialize,deserialize} from 'node:v8';
const DAY=86400000;
const digest=b=>createHash('sha256').update(b).digest('hex');
function decode(bytes,key){if(bytes.subarray(0,4).toString()!=='PRB1')throw Error('Formato backup non valido');const c=createDecipheriv('aes-256-gcm',key,bytes.subarray(4,16));c.setAuthTag(bytes.subarray(16,32));return deserialize(gunzipSync(Buffer.concat([c.update(bytes.subarray(32)),c.final()])));}
export function restoreBackup(bytes,key,destination) {
  const bundle=decode(bytes,key),dir=destination?path.resolve(destination):mkdtempSync(path.join(tmpdir(),'prime-restore-'));
  if(destination){if(existsSync(dir))throw Error('La destinazione deve essere una nuova cartella');mkdirSync(dir,{recursive:true,mode:0o700});}
  try {
    if(bundle.version!==1||!Array.isArray(bundle.files))throw Error('Manifest non valido');
    for(const f of bundle.files){const target=path.resolve(dir,f.name);if(!target.startsWith(dir+path.sep)||digest(f.bytes)!==f.sha256)throw Error('Integrità allegati non valida');mkdirSync(path.dirname(target),{recursive:true,mode:0o700});writeFileSync(target,f.bytes,{mode:0o600});}
    const restored=new DatabaseSync(path.join(dir,'prime.sqlite'),{readOnly:true});try{if(restored.prepare('PRAGMA integrity_check').get().integrity_check!=='ok'||restored.prepare('PRAGMA foreign_key_check').get())throw Error('Integrità database non valida');restored.prepare('SELECT count(*) FROM tenants').get();}finally{restored.close();}
    return {verified_at:new Date().toISOString(),files:bundle.files.length};
  } finally {if(!destination)rmSync(dir,{recursive:true,force:true});}
}
export const verifyBackup=(bytes,key)=>restoreBackup(bytes,key);
export function encryptBundle(bundle,key) {
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
  const encrypted=Buffer.concat([cipher.update(gzipSync(serialize(bundle))),cipher.final()]);
  return Buffer.concat([Buffer.from('PRB1'),iv,cipher.getAuthTag(),encrypted]);
}
export function backupService({db,database,directory=process.env.PRIME_BACKUP_DIR,key=process.env.PRIME_BACKUP_KEY,retention=Number(process.env.PRIME_BACKUP_RETENTION_DAYS||30),defaultEnabled=process.env.NODE_ENV==='production'||!!process.env.FLY_APP_NAME}) {
  let timer,busy=false,error=null,last=null;
  const dataDirectory=database&&database!==':memory:'?path.dirname(path.resolve(database)):null;
  directory ||= dataDirectory && defaultEnabled ? path.join(dataDirectory,'backups') : null;
  let secret=key?Buffer.from(key,'base64'):null;
  if(dataDirectory&&directory&&!key) {
    try {const keyFile=path.join(dataDirectory,'backup.key');mkdirSync(dataDirectory,{recursive:true,mode:0o700});
      if(!existsSync(keyFile)){try{writeFileSync(keyFile,randomBytes(32),{flag:'wx',mode:0o600});}catch(e){if(e.code!=='EEXIST')throw e;}}
      secret=readFileSync(keyFile);
    }catch(e){error=e.message;}
  }
  const configured=!!(dataDirectory&&directory&&secret?.length===32&&Number.isInteger(retention)&&retention>=2&&retention<=3650);
  const destination=directory?path.resolve(directory):null;
  const files=()=>configured&&existsSync(destination)?readdirSync(destination).filter(x=>/^prime-\d{13}-[a-f0-9]+\.prb$/.test(x)).sort():[];
  function status(){const names=files();return {configured,default_enabled:defaultEnabled,running:busy,last_verified:last?.verified_at||null,last_backup:names.at(-1)?.slice(6,19)?new Date(Number(names.at(-1).slice(6,19))).toISOString():null,retention_days:retention,interval_hours:24,error:error?'Backup non riuscito: verifica configurazione, chiave e spazio disponibile':null};}
  async function run(){if(!configured||busy)return;busy=true;let temp;
    try {
      mkdirSync(destination,{recursive:true,mode:0o700});temp=mkdtempSync(path.join(tmpdir(),'prime-backup-'));
      const snapshot=path.join(temp,'prime.sqlite');await backup(db,snapshot);
      const entries=[];const add=(name,bytes)=>entries.push({name,bytes,sha256:digest(bytes)});add('prime.sqlite',readFileSync(snapshot));
      const collect=(folder,relative)=>{if(!existsSync(folder))return;for(const name of readdirSync(folder)){const full=path.join(folder,name),stat=lstatSync(full);if(stat.isSymbolicLink())throw Error('Allegato simbolico non consentito');if(stat.isDirectory())collect(full,path.join(relative,name));else if(stat.isFile())add(path.join(relative,name),readFileSync(full));}};
      collect(path.join(dataDirectory,'uploads'),'uploads');
      if(existsSync(path.join(dataDirectory,'connect.key')))add('connect.key',readFileSync(path.join(dataDirectory,'connect.key')));
      const bytes=encryptBundle({version:1,created_at:new Date().toISOString(),files:entries},secret);
      const name=`prime-${Date.now()}-${randomBytes(4).toString('hex')}.prb`,partial=path.join(destination,name+'.partial');writeFileSync(partial,bytes,{flag:'wx',mode:0o600});
      last=verifyBackup(readFileSync(partial),secret);renameSync(partial,path.join(destination,name));error=null;
      // Retention is applied only after a successful restore test, keeping at least two backups.
      const names=files();for(const old of names.slice(0,-2))if(Number(old.slice(6,19))<Date.now()-retention*DAY)rmSync(path.join(destination,old));
    }catch(e){error=e.message;console.error('PRIME backup failed:',e.message);}finally{if(temp)rmSync(temp,{recursive:true,force:true});busy=false;}
    return status();
  }
  async function tick(){const latest=files().at(-1);if(!latest||Date.now()-Number(latest.slice(6,19))>=DAY)await run();}
  function start(){if(configured){tick();timer=setInterval(tick,60000);timer.unref();}}
  return {status,run,start,close(){clearInterval(timer);}};
}
