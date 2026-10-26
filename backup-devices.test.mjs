import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes,createHash,generateKeyPairSync} from 'node:crypto';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,readdirSync,rmSync,existsSync} from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {createApp} from './server.mjs';
import {openDatabase} from './src/database.mjs';
import {backupService,verifyBackup} from './src/backups.mjs';
import {decryptDeviceBackup,verifyDeviceBackup,syncPC} from './public/backup-companion.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');

test('Fly default backup creates persistent encryption key; PC remains opt-in',async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'prime-default-backup-')),name=path.join(dir,'db.sqlite'),db=openDatabase(name);
 try{const service=backupService({db,database:name,defaultEnabled:true});assert.equal(service.status().configured,true);assert.equal(readFileSync(path.join(dir,'backup.key')).length,32);await service.run();const copies=readdirSync(path.join(dir,'backups')).filter(x=>x.endsWith('.prb'));assert.equal(copies.length,1);verifyBackup(readFileSync(path.join(dir,'backups',copies[0])),readFileSync(path.join(dir,'backup.key')));const key=readFileSync(path.join(dir,'backup.key'));backupService({db,database:name,defaultEnabled:true});assert.deepEqual(readFileSync(path.join(dir,'backup.key')),key);assert.equal(db.prepare('SELECT count(*) n FROM backup_devices').get().n,0);
 }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});

test('optional PC pairing, scoped encrypted server/local copies, restore verification and revocation',async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'prime-pc-backup-')),database=path.join(dir,'db.sqlite');const app=createApp({database,connectInterval:0});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${app.server.address().port}`;
 const member=(role,tenant)=>{app.db.prepare('INSERT OR IGNORE INTO tenants VALUES (?,?)').run(tenant,tenant);const id=randomUUID(),token=randomBytes(32).toString('hex'),csrf=randomBytes(16).toString('hex');app.db.prepare('INSERT INTO users(id,email,password,totp_secret_cipher) VALUES (?,?,?,?)').run(id,id+'@test.invalid','private-password-'+tenant,'totp-private-'+tenant);app.db.prepare('INSERT INTO memberships VALUES (?,?,?)').run(id,tenant,role);app.db.prepare('INSERT INTO sessions(token,user_id,tenant_id,expires,csrf) VALUES (?,?,?,?,?)').run(hash(token),id,tenant,Date.now()+600000,csrf);return {id,csrf,cookie:'prime_session='+token};};
 const owner=member('owner','agency-a'),other=member('owner','agency-b'),agent=member('agent','agency-a');
 const req=async(user,url,method='GET',data,headers={})=>{const response=await fetch(base+url,{method,headers:{'Content-Type':'application/json',...(user?{Cookie:user.cookie,'X-CSRF-Token':user.csrf}:{}),...headers},...(data?{body:JSON.stringify(data)}:{})});const value=await response.json();return {status:response.status,value};};
 const keys=generateKeyPairSync('rsa',{modulusLength:2048,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});
 try {
  for(const user of [owner,other]){const result=await req(user,'/api/entities/contacts','POST',{data:{title:user===owner?'Only agency A':'PRIVATE AGENCY B',email:user===owner?'a@test.invalid':'secret-b@test.invalid'}});assert.equal(result.status,201);}
  const afolder=path.join(dir,'uploads',hash('agency-a')),bfolder=path.join(dir,'uploads',hash('agency-b'));mkdirSync(afolder,{recursive:true});mkdirSync(bfolder,{recursive:true});writeFileSync(path.join(afolder,'owned.pdf'),'A document');writeFileSync(path.join(bfolder,'secret.pdf'),'PRIVATE B DOCUMENT');
  assert.deepEqual((await req(owner,'/api/backups/devices')).value,[]);
  const installerResponse=await fetch(base+'/backup-pc-windows.cmd');assert.equal(installerResponse.status,200);const installer=await installerResponse.text();assert.ok(installer.includes(base));assert.ok(installer.includes('FolderBrowserDialog'));assert.ok(installer.split(/\r?\n/).every(line=>line.length<8191));assert.ok(installer.includes('exit /b %errorlevel%'));
  assert.equal((await req(agent,'/api/backups/devices/pairing','POST',{label:'PC'})).status,403);
  assert.equal((await req(owner,'/api/backups/devices/pairing','POST',{label:'PC'},{'X-CSRF-Token':'wrong'})).status,403);
  const pairing=await req(owner,'/api/backups/devices/pairing','POST',{label:'PC agenzia'});assert.equal(pairing.status,201);
  const paired=await req(null,'/api/backup-device/pair','POST',{code:pairing.value.code,public_key:keys.publicKey});assert.equal(paired.status,201);assert.ok(paired.value.token);
  assert.equal((await req(null,'/api/backup-device/pair','POST',{code:pairing.value.code,public_key:keys.publicKey})).status,410);
  assert.equal((await req(other,'/api/backups/devices/'+paired.value.id,'DELETE')).status,404);
  assert.equal((await req(null,'/api/entities/contacts','GET',null,{Authorization:'Bearer '+paired.value.token})).status,401);
  const response=await fetch(base+'/api/backup-device/snapshot',{headers:{Authorization:'Bearer '+paired.value.token}});assert.equal(response.status,200);const bytes=Buffer.from(await response.arrayBuffer());
  const bundle=decryptDeviceBackup(bytes,keys.privateKey,paired.value.id);assert.equal(bundle.tenant_id,'agency-a');assert.ok(bundle.files.every(f=>!f.name.includes(hash('agency-b'))));assert.ok(!bytes.includes(Buffer.from('A document')));
  const restored=path.join(dir,'restored');verifyDeviceBackup(bytes,keys.privateKey,paired.value.id,restored);const restoredDb=new DatabaseSync(path.join(restored,'prime.sqlite'),{readOnly:true});try{
   assert.equal(restoredDb.prepare('SELECT count(*) n FROM tenants').get().n,1);assert.equal(restoredDb.prepare('SELECT title FROM contacts').get().title,'Only agency A');assert.equal(restoredDb.prepare('SELECT count(*) n FROM sessions').get().n,0);assert.equal(restoredDb.prepare('SELECT count(*) n FROM backup_devices').get().n,0);assert.equal(restoredDb.prepare("SELECT count(*) n FROM users WHERE email=?").get(other.id+'@test.invalid').n,0);assert.equal(restoredDb.prepare("SELECT count(*) n FROM users WHERE totp_secret_cipher<>''").get().n,0);assert.ok(!readFileSync(path.join(restored,'prime.sqlite')).includes(Buffer.from('private-password')));
  }finally{restoredDb.close();}
  assert.equal(readFileSync(path.join(restored,'uploads',hash('agency-a'),'owned.pdf'),'utf8'),'A document');assert.throws(()=>verifyDeviceBackup(bytes,keys.privateKey,randomUUID()),/altro computer/);
  const altered=Buffer.from(bytes);altered[altered.length-10]^=1;assert.throws(()=>verifyDeviceBackup(altered,keys.privateKey,paired.value.id));
  const folder=path.join(dir,'chosen-pc-folder');mkdirSync(folder);const config=path.join(dir,'device-config.json');writeFileSync(config,JSON.stringify({server:base,token:paired.value.token,id:paired.value.id,private_key:keys.privateKey,folder}),{mode:0o600});
  assert.equal((await syncPC(config)).saved,true);assert.equal((await syncPC(config)).unchanged,true);assert.equal(readdirSync(folder).filter(x=>x.endsWith('.prb2')).length,1);assert.ok((await req(owner,'/api/backups/devices')).value[0].last_saved_at);
  assert.ok(existsSync(path.join(dir,'backups','devices',paired.value.id)));
  assert.equal((await req(owner,'/api/backups/devices/'+paired.value.id,'DELETE')).status,200);
  assert.equal((await req(null,'/api/backup-device/ack','POST',{ok:true},{Authorization:'Bearer '+paired.value.token})).status,401);
  await assert.rejects(syncPC(config),/401/);
 }finally{await new Promise(r=>app.server.close(r));app.db.close();rmSync(dir,{recursive:true,force:true});}
});
