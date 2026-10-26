import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {mkdtempSync,rmSync,readFileSync,writeFileSync,readdirSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import ExcelJS from 'exceljs';
import {createApp} from './server.mjs';
import {scoreMatch} from './src/insights.mjs';
import {parseCSV,parseImport} from './src/imports.mjs';
import {backupService,verifyBackup,restoreBackup} from './src/backups.mjs';
import {openDatabase,transaction} from './src/database.mjs';

test('matching: explainable score, unknown data, hard criteria and inactive requests',()=>{
 const profile={status:'attiva',operation_type:'vendita',preferred_areas:'Milano',min_area:80,min_rooms:3,budget_max:300000,needs_garage:1,preferred_floor:'2'};
 const p={marketing_status:'in vendita',city:'Milano',price:250000,area:90,rooms:3,has_garage:1,floor:'2'};
 const result=scoreMatch(profile,p);assert.equal(result.score,100);assert.equal(result.quality,'alta');assert.equal(result.components.reduce((s,x)=>s+x.points,0),result.components.reduce((s,x)=>s+x.weight,0));
 assert.equal(scoreMatch(profile,{...p,price:400000}),null);assert.equal(scoreMatch({...profile,status:'in pausa'},p),null);
 const unknown=scoreMatch(profile,{...p,area:null});assert.ok(unknown.score<100);assert.equal(unknown.quality,'da verificare');assert.ok(unknown.missing.includes('superficie'));
});
test('CSV and XLSX parsing: multiline, Italian separator, formulas and malformed input',async()=>{
 assert.deepEqual(parseCSV('nome;note\r\nMario;"due\nrighe"'),[['nome','note'],['Mario','due\nrighe']]);
 assert.throws(()=>parseCSV('a,b\n"unterminated'));
 const w=new ExcelJS.Workbook(),sheet=w.addWorksheet('Export');sheet.addRow(['title','email']);sheet.addRow(['Mario','m@example.invalid']);
 const parsed=await parseImport('export.xlsx',Buffer.from(await w.xlsx.writeBuffer()));assert.equal(parsed.rows[0].title,'Mario');
 sheet.getCell('A2').value={formula:'1+1',result:2};await assert.rejects(parseImport('export.xlsx',Buffer.from(await w.xlsx.writeBuffer())),/Formule/);
 await assert.rejects(parseImport('x.csv',Buffer.from('a,a\n1,2')),/duplicate/);
});
test('API: dashboard roles, automatic matching, import preview validation, tenant isolation and deduplication',async()=>{
 const app=createApp({database:':memory:',connectInterval:0});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${app.server.address().port}`;
 const member=(role,tenant)=>{app.db.prepare('INSERT OR IGNORE INTO tenants VALUES (?,?)').run(tenant,tenant);const id=randomUUID(),token=randomBytes(32).toString('hex'),csrf=randomBytes(16).toString('hex');app.db.prepare('INSERT INTO users(id,email,password) VALUES (?,?,?)').run(id,id+'@test.invalid','disabled');app.db.prepare('INSERT INTO memberships VALUES (?,?,?)').run(id,tenant,role);app.db.prepare('INSERT INTO sessions(token,user_id,tenant_id,expires,csrf) VALUES (?,?,?,?,?)').run(createHash('sha256').update(token).digest('hex'),id,tenant,Date.now()+600000,csrf);return {id,cookie:'prime_session='+token,csrf};};
 const owner=member('owner','a'),agent=member('agent','a'),other=member('owner','b'),external=member('external','a');
 const req=async(user,url,method='GET',data)=>{const r=await fetch(base+url,{method,headers:{Cookie:user.cookie,'X-CSRF-Token':user.csrf,'Content-Type':'application/json'},...(data?{body:JSON.stringify(data)}:{})});return {status:r.status,value:await r.json()};};
 const create=async(entity,data)=>{const r=await req(owner,'/api/entities/'+entity,'POST',{data});assert.equal(r.status,201,JSON.stringify(r.value));return r.value;};
 try {
  const contact=await create('contacts',{title:'Cliente',email:'cliente@test.invalid',assigned_agent_id:agent.id});
  const p=await create('properties',{title:'Casa',assigned_agent_id:agent.id,price:200000,marketing_status:'in vendita',mandate_expires_on:'2020-01-01'});
  assert.equal((await req(owner,'/api/entities/properties','POST',{data:{title:'Data errata',mandate_expires_on:'2026-02-30'}})).status,400);
  const profile=await create('buyer_profiles',{title:'Ricerca',contact_id:contact.id,assigned_agent_id:agent.id,budget_max:250000});
  const match=await req(agent,'/api/matching/'+profile.id);assert.equal(match.value[0].id,p.id);assert.equal(match.value[0].score,100);
  const dash=await req(agent,'/api/dashboard');assert.equal(dash.status,200);assert.equal(dash.value.scope,'personale');assert.equal(dash.value.agents.length,1);assert.equal(dash.value.deadlines[0].overdue,true);
  assert.equal((await req(other,'/api/dashboard')).value.recent.length,0);assert.equal((await req(other,'/api/matching/'+profile.id)).status,404);
  assert.equal((await req(external,'/api/dashboard')).status,403);assert.equal((await req(agent,'/api/imports')).status,403);assert.equal((await req(agent,'/api/backups/status')).status,403);
  const input={entity:'contacts',mapping:{title:'Nome',email:'Mail'},rows:[{Nome:'Nuovo',Mail:'nuovo@test.invalid'},{Nome:'Nuovo',Mail:'nuovo@test.invalid'},{Nome:'Cliente',Mail:'cliente@test.invalid'}]};
  let preview=await req(owner,'/api/imports/preview','POST',input);assert.equal(preview.value.ready,1);
  assert.equal((await req(other,'/api/imports/commit','POST',{id:preview.value.id})).status,410);
  const committed=await req(owner,'/api/imports/commit','POST',{id:preview.value.id});assert.deepEqual(committed.value,{inserted:1,skipped:2});assert.equal((await req(owner,'/api/imports/commit','POST',{id:preview.value.id})).status,409);
  preview=await req(owner,'/api/imports/preview','POST',{...input,rows:[{Nome:'Bad',Mail:'wrong'}]});assert.equal(preview.value.report[0].status,'invalid');assert.equal((await req(owner,'/api/imports/commit','POST',{id:preview.value.id})).status,400);
  preview=await req(owner,'/api/imports/preview','POST',{entity:'buyer_profiles',mapping:{title:'Nome',contact_id:'Cliente'},rows:[{Nome:'Cross tenant',Cliente:other.id}]});assert.equal(preview.value.report[0].status,'invalid');
  preview=await req(owner,'/api/imports/preview','POST',{entity:'buyer_profiles',mapping:{title:'Nome',contact_id:'Cliente'},rows:[{Nome:'Per email',Cliente:'cliente@test.invalid'}]});assert.equal(preview.value.ready,1);assert.equal(preview.value.report[0].data.contact_id,contact.id);
  app.db.prepare("UPDATE properties SET price=900000 WHERE id=?").run(p.id);assert.equal((await req(agent,'/api/matching/'+profile.id)).value.length,0);
  assert.equal(app.db.prepare('PRAGMA foreign_key_check').get(),undefined);
 }finally{await new Promise(r=>app.server.close(r));app.db.close();}
});
test('migrations reopen safely; nested transaction rolls back all imported rows',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'prime-migrations-'));let db;
 try{const name=path.join(dir,'db.sqlite');db=openDatabase(name);const count=db.prepare('SELECT count(*) n FROM migrations').get().n;db.prepare('INSERT INTO tenants VALUES (?,?)').run('preserve','Original');db.close();db=openDatabase(name);assert.equal(db.prepare('SELECT count(*) n FROM migrations').get().n,count);assert.equal(db.prepare('SELECT name FROM tenants').get().name,'Original');
 assert.throws(()=>transaction(db,()=>{transaction(db,()=>db.prepare('INSERT INTO tenants VALUES (?,?)').run('rollback','X'));throw Error('abort');}));assert.equal(db.prepare("SELECT * FROM tenants WHERE id='rollback'").get(),undefined);
 }finally{db?.close();rmSync(dir,{recursive:true,force:true});}
});
test('encrypted backup restores DB and attachments; tampering rejected; retention keeps two verified copies',async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'prime-backups-')),database=path.join(dir,'prime.sqlite'),destination=path.join(dir,'backups'),key=randomBytes(32);const db=openDatabase(database);
 try{db.prepare('INSERT INTO tenants VALUES (?,?)').run('keep','Preserved');mkdirSync(path.join(dir,'uploads'));writeFileSync(path.join(dir,'uploads','document.pdf'),'test attachment');
 const b=backupService({db,database,directory:destination,key:key.toString('base64'),retention:2});assert.equal(b.status().configured,true);await b.run();let names=readdirSync(destination).filter(x=>x.endsWith('.prb'));assert.equal(names.length,1);let bytes=readFileSync(path.join(destination,names[0]));assert.ok(!bytes.includes(Buffer.from('Preserved')));assert.equal(verifyBackup(bytes,key).files,2);const corrupt=Buffer.from(bytes);corrupt[50]^=1;assert.throws(()=>verifyBackup(corrupt,key));assert.throws(()=>verifyBackup(bytes,randomBytes(32)));
 const recovered=path.join(dir,'recovered');restoreBackup(bytes,key,recovered);assert.equal(readFileSync(path.join(recovered,'uploads','document.pdf'),'utf8'),'test attachment');assert.throws(()=>restoreBackup(bytes,key,recovered),/nuova cartella/);
 for(let i=4;i>=2;i--)writeFileSync(path.join(destination,`prime-${Date.now()-i*86400000}-abcdef01.prb`),bytes);
 await b.run();names=readdirSync(destination).filter(x=>x.endsWith('.prb'));assert.equal(names.length,2);assert.ok(b.status().last_verified);assert.equal(db.prepare('SELECT name FROM tenants').get().name,'Preserved');
 }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});
