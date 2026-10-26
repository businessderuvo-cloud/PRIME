// PRIME Backup PC — Node.js 24+, no third-party dependencies.
import {readFileSync,writeFileSync,mkdirSync,existsSync,readdirSync,renameSync,mkdtempSync,rmSync,copyFileSync,statSync} from 'node:fs';
import {createHash,generateKeyPairSync,privateDecrypt,createDecipheriv,constants} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {gunzipSync} from 'node:zlib';
import {deserialize} from 'node:v8';
import {tmpdir,homedir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createInterface} from 'node:readline/promises';
const sha=x=>createHash('sha256').update(x).digest('hex');
export function decryptDeviceBackup(bytes,privateKey,deviceId) {
  if(bytes.subarray(0,4).toString()!=='PRD1'||bytes.length<8)throw Error('Formato copia PC non valido');
  const length=bytes.readUInt32BE(4);if(length>10000||length+8>bytes.length)throw Error('Manifest non valido');
  const header=JSON.parse(bytes.subarray(8,8+length).toString());if(header.version!==1||header.device_id!==deviceId)throw Error('Copia destinata a un altro computer');
  const key=privateDecrypt({key:privateKey,padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'},Buffer.from(header.wrapped_key,'base64'));
  const encrypted=bytes.subarray(8+length);if(encrypted.subarray(0,4).toString()!=='PRB1')throw Error('Archivio non valido');
  const cipher=createDecipheriv('aes-256-gcm',key,encrypted.subarray(4,16));cipher.setAuthTag(encrypted.subarray(16,32));
  const bundle=deserialize(gunzipSync(Buffer.concat([cipher.update(encrypted.subarray(32)),cipher.final()])));
  if(bundle.version!==1||!Array.isArray(bundle.files))throw Error('Backup non valido');
  return bundle;
}
export function verifyDeviceBackup(bytes,privateKey,deviceId,destination) {
  const bundle=decryptDeviceBackup(bytes,privateKey,deviceId);
  const folder=destination?path.resolve(destination):mkdtempSync(path.join(tmpdir(),'prime-pc-restore-'));
  if(destination){if(existsSync(folder))throw Error('Il ripristino richiede una nuova cartella');mkdirSync(folder,{recursive:true,mode:0o700});}
  try{for(const f of bundle.files){const file=path.resolve(folder,f.name);if(!file.startsWith(folder+path.sep)||sha(f.bytes)!==f.sha256)throw Error('Integrità dei file non valida');mkdirSync(path.dirname(file),{recursive:true,mode:0o700});writeFileSync(file,f.bytes,{mode:0o600});}
    const db=new DatabaseSync(path.join(folder,'prime.sqlite'),{readOnly:true});try{if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok'||db.prepare('PRAGMA foreign_key_check').get())throw Error('Integrità database non valida');}finally{db.close();}
    return {files:bundle.files.length,tenant_id:bundle.tenant_id};
  }finally{if(!destination)rmSync(folder,{recursive:true,force:true});}
}
function protect(file){if(process.platform==='win32'){
  const account=execFileSync('whoami.exe',[],{encoding:'utf8',windowsHide:true}).trim();
  execFileSync('icacls.exe',[file,'/inheritance:r','/grant:r',account+':(F)','*S-1-5-18:(F)'],{stdio:'pipe',windowsHide:true});
}}
function saveConfig(file,value){writeFileSync(file,JSON.stringify(value,null,2),{mode:0o600});protect(file);}
function safeURL(value){const u=new URL(value);if(u.username||u.password||u.search||u.hash||u.pathname!=='/'||(u.protocol!=='https:'&&!(u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname))))throw Error('Indica l’indirizzo HTTPS di PRIME (HTTP ammesso solo su localhost)');return u.origin;}
async function request(config,endpoint,options={}){return fetch(config.server+endpoint,{...options,redirect:'error',headers:{Authorization:'Bearer '+config.token,...options.headers},signal:AbortSignal.timeout(180000)});}
export async function syncPC(configFile) {
  const config=JSON.parse(readFileSync(configFile,'utf8'));config.server=safeURL(config.server);
  mkdirSync(config.folder,{recursive:true,mode:0o700});
  const lock=path.join(path.dirname(configFile),'sync.lock');
  try{mkdirSync(lock);}catch(e){if(e.code!=='EEXIST')throw e;if(Date.now()-statSync(lock).mtimeMs<30*60000)throw Error('Un’altra copia è in corso');rmSync(lock,{recursive:true,force:true});mkdirSync(lock);}
  try{
    const current=config.etag&&config.last_file&&existsSync(path.join(config.folder,config.last_file));
    const response=await request(config,'/api/backup-device/snapshot',{headers:current?{'If-None-Match':config.etag}:{}});
    if(response.status===304)return {unchanged:true};
    if(!response.ok)throw Error('Server PRIME: '+response.status+' — verifica il collegamento nella dashboard');
    const bytes=Buffer.from(await response.arrayBuffer());verifyDeviceBackup(bytes,config.private_key,config.id);
    const name=`prime-pc-${config.id}-${Date.now()}.prb2`,dest=path.join(config.folder,name);writeFileSync(dest+'.partial',bytes,{flag:'wx',mode:0o600});renameSync(dest+'.partial',dest);
    config.etag=response.headers.get('etag');config.last_file=name;config.last_saved_at=new Date().toISOString();saveConfig(configFile,config);
    const ack=await request(config,'/api/backup-device/ack',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ok:true})});if(!ack.ok)throw Error('Copia salvata; conferma al server non riuscita');
    const prefix='prime-pc-'+config.id+'-';const names=readdirSync(config.folder).filter(x=>x.startsWith(prefix)&&/^\d{13}\.prb2$/.test(x.slice(prefix.length))).sort();
    const retention=config.retention_days||30;for(const old of names.slice(0,-2))if(Number(old.slice(prefix.length,-5))<Date.now()-retention*86400000)rmSync(path.join(config.folder,old));
    return {saved:true};
  }catch(e){try{await request(config,'/api/backup-device/ack',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ok:false,error:'Copia PC non riuscita: controlla connessione, cartella e spazio disponibile'})});}catch{}throw e;}
  finally{rmSync(lock,{recursive:true,force:true});}
}
async function setup(gui=false){
  const input=gui?null:createInterface({input:process.stdin,output:process.stdout});let server,code,folder;
  if(gui){server=safeURL(process.env.PRIME_PC_SETUP_SERVER);code=process.env.PRIME_PC_SETUP_CODE;folder=process.env.PRIME_PC_SETUP_FOLDER;if(!code||!folder||!path.isAbsolute(folder))throw Error('Scegli un codice e una cartella validi');}
  else {
  try{server=safeURL((await input.question('Indirizzo PRIME (https://…): ')).trim());code=(await input.question('Codice di collegamento mostrato dal titolare: ')).trim();folder=(await input.question('Cartella dove salvare le copie (percorso completo): ')).trim();if(!path.isAbsolute(folder)||!folder)throw Error('Cartella non valida');}finally{input.close();}
  }
  mkdirSync(folder,{recursive:true,mode:0o700});
  const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});
  const response=await fetch(server+'/api/backup-device/pair',{method:'POST',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify({code,public_key:publicKey}),signal:AbortSignal.timeout(30000)});const paired=await response.json();if(!response.ok)throw Error(paired.error||'Collegamento non riuscito');
  const state=path.join(process.env.LOCALAPPDATA||path.join(homedir(),'.local','share'),'PRIME','backup-devices',paired.id);mkdirSync(state,{recursive:true,mode:0o700});
  const script=path.join(state,'backup-companion.mjs');copyFileSync(fileURLToPath(import.meta.url),script);
  const file=path.join(state,'config.json');saveConfig(file,{id:paired.id,token:paired.token,server,folder,private_key:privateKey,retention_days:30});
  await syncPC(file);console.log('Prima copia salvata e ripristino verificato nella cartella scelta.');
  if(process.platform==='win32'){
    const ps=x=>"'"+x.replaceAll("'","''")+"'";
    const command=`$action=New-ScheduledTaskAction -Execute ${ps(process.execPath)} -Argument ${ps('"'+script+'" --sync "'+file+'"')}; $trigger=New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(5) -RepetitionInterval (New-TimeSpan -Hours 1); $principal=New-ScheduledTaskPrincipal -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited; $settings=New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 20); Register-ScheduledTask -TaskName ${ps('PRIME Backup '+paired.id)} -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null`;
    execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(command,'utf16le').toString('base64')],{windowsHide:true,stdio:'pipe'});
    console.log('Copia automatica attivata per questo utente Windows. Controllo ogni ora, nuova copia ogni 24 ore, anche con browser chiuso. Il PC deve essere acceso e l’utente connesso.');
  }else console.log(`Per eseguire periodicamente: node ${JSON.stringify(script)} --sync ${JSON.stringify(file)}. Configura lo scheduler del sistema oppure usa --watch.`);
  console.log('Configurazione privata:',file);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [mode,file,backupFile,destination]=process.argv.slice(2);
  try{
    if(mode==='--setup'||mode==='--setup-ui')await setup(mode==='--setup-ui');
    else if(mode==='--sync')console.log(await syncPC(file));
    else if(mode==='--watch'){await syncPC(file);setInterval(()=>syncPC(file).catch(e=>console.error(e.message)),3600000);}
    else if(mode==='--restore'){const c=JSON.parse(readFileSync(file,'utf8'));console.log(verifyDeviceBackup(readFileSync(backupFile),c.private_key,c.id,destination));}
    else console.log('PRIME Backup PC: --setup | --sync CONFIG | --watch CONFIG | --restore CONFIG COPIA.prb2 NUOVA_CARTELLA');
  }catch(e){console.error(e.message);process.exitCode=1;}
}
