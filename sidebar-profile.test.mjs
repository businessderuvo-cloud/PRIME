import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';
import {createApp} from './server.mjs';
test('sidebar profile: owner rename, agent denial, personal photos and tenant isolation',async()=>{
 const app=createApp({database:':memory:',connectInterval:0,edition:'base'});
 app.db.prepare('INSERT INTO tenants(id,name) VALUES (?,?)').run('a','Agency A');
 app.db.prepare('INSERT INTO tenants(id,name) VALUES (?,?)').run('b','Agency B');
 const sessions={};
 for(const [id,role,tenant] of [['owner','owner','a'],['agent','agent','a'],['manager','manager','a'],['other','owner','b']]){
 app.db.prepare('INSERT INTO users(id,email,password,email_verified) VALUES (?,?,?,1)').run(id,id+'@example.test','unused');
 app.db.prepare('INSERT INTO memberships VALUES (?,?,?)').run(id,tenant,role);
 const token=randomBytes(32).toString('hex'),csrf=randomBytes(24).toString('hex');sessions[id]={token,csrf};
 app.db.prepare('INSERT INTO sessions(token,user_id,tenant_id,expires,csrf) VALUES (?,?,?,?,?)').run(createHash('sha256').update(token).digest('hex'),id,tenant,Date.now()+60000,csrf);
 }
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.server.address().port;
 async function call(id,body){const s=sessions[id];const r=await fetch(base+(body?'/api/preferences/profile':'/api/me'),{method:body?'PATCH':'GET',headers:{Cookie:'prime_session='+s.token,'X-CSRF-Token':s.csrf,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()};}
 try{
 assert.equal((await call('owner',{agency_name:'New Agency'})).status,200);
 for(const role of ['agent','manager'])assert.equal((await call(role,{agency_name:'Forbidden',photo:''})).status,403);
 assert.equal((await call('agent')).body.tenant,'New Agency');assert.equal((await call('other')).body.tenant,'Agency B');
 const photo='data:image/jpeg;base64,'+Buffer.from([255,216,255,224,255,217]).toString('base64');
 assert.equal((await call('agent',{photo})).status,200);assert.equal((await call('agent')).body.profile_photo,photo);assert.equal((await call('owner')).body.profile_photo,'');
 assert.equal((await call('agent',{photo:'data:image/svg+xml;base64,PHN2Zz4='})).status,400);
 assert.equal((await call('owner',{agency_name:' '})).status,400);
 assert.equal((await call('agent',{user_id:'owner',photo:''})).status,400);
 }finally{await new Promise(r=>app.server.close(r));app.db.close();}
});
