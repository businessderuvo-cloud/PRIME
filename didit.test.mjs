import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,randomBytes,createHash,createHmac} from 'node:crypto';
import {createApp} from './server.mjs';
import {canonicalDidit,verifyDidit,diditConfig} from './src/didit.mjs';
const config={apiKey:'test-server-secret',workflowId:'workflow-kyb',applicationId:'application-sandbox',environment:'sandbox',webhookSecret:'webhook-test-secret'};
const digest=value=>createHmac('sha256',config.webhookSecret).update(value).digest('hex');
test('Didit signatures cover all data, Unicode and numeric keys, reject malformed timestamps and old replays',()=>{
 const body={z:'José',empty:{},keys:{'2':2,'10':10},array:[{b:2,a:1}]},raw=Buffer.from(JSON.stringify(body));
 assert.equal(canonicalDidit(body),'{"array":[{"a":1,"b":2}],"empty":{},"keys":{"10":10,"2":2},"z":"José"}');
 const headers={'x-timestamp':String(Math.floor(Date.now()/1000)),'x-signature-v2':digest(canonicalDidit(body))};
 assert.equal(verifyDidit(raw,body,headers,config.webhookSecret),true);
 assert.equal(verifyDidit(raw,{...body,z:'forged'},headers,config.webhookSecret),false);
 for(const timestamp of ['','NaN','123garbage','1'])assert.equal(verifyDidit(raw,body,{...headers,'x-timestamp':timestamp},config.webhookSecret),false);
 assert.equal(verifyDidit(raw,body,{'x-timestamp':headers['x-timestamp'],'x-signature-simple':digest(raw)},config.webhookSecret),false);
 assert.equal(verifyDidit(raw,body,{'x-timestamp':headers['x-timestamp'],'x-signature-v2-previous':headers['x-signature-v2']},config.webhookSecret),true);
 assert.equal(verifyDidit(raw,body,{'x-timestamp':headers['x-timestamp'],'x-signature':digest(raw)},config.webhookSecret),true);
});
test('Production configuration never imports the local sandbox secret',()=>{
 const cfg=diditConfig({production:true,env:{}});assert.equal(cfg.apiKey,'');assert.equal(cfg.environment,'sandbox');
});
test('KYB HTTP flow isolates agencies, restricts roles, reuses sessions and reconciles signed events',async t=>{
 let calls=0,decisionCalls=0,remoteStatus='In Progress',saved;
 const app=createApp({database:':memory:',connectInterval:0,diditOptions:config,connectFetch:async(url,options)=>{
  assert.equal(options.headers['x-api-key'],config.apiKey);
  if(options.method==='POST'){calls++;saved=JSON.parse(options.body);return Response.json({session_id:'session-one',url:'https://verify.didit.me/session-one',status:'Not Started',environment:'sandbox'});}
  decisionCalls++;return Response.json({session_id:'session-one',workflow_id:config.workflowId,vendor_data:saved.vendor_data,session_kind:'business',environment:'sandbox',status:remoteStatus});
 }});
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{await new Promise(resolve=>app.server.close(resolve));app.db.close();});
 const base='http://127.0.0.1:'+app.server.address().port;
 function member(role,tenant=randomUUID()){
  if(!app.db.prepare('SELECT id FROM tenants WHERE id=?').get(tenant))app.db.prepare('INSERT INTO tenants VALUES (?,?)').run(tenant,'Test agency');
  const id=randomUUID(),token=randomBytes(32).toString('hex'),csrf=randomBytes(32).toString('hex');
  app.db.prepare('INSERT INTO users(id,email,password) VALUES (?,?,?)').run(id,id+'@test.invalid','disabled');
  app.db.prepare('INSERT INTO memberships VALUES (?,?,?)').run(id,tenant,role);
  app.db.prepare('INSERT INTO sessions(token,user_id,tenant_id,expires,csrf) VALUES (?,?,?,?,?)').run(createHash('sha256').update(token).digest('hex'),id,tenant,Date.now()+60000,csrf);
  return {tenant,id,headers:{Cookie:'prime_session='+token,'X-CSRF-Token':csrf,'Content-Type':'application/json'}};
 }
 const owner=member('owner'),other=member('owner'),agent=member('agent',owner.tenant),manager=member('manager',owner.tenant);
 const req=async(user,endpoint,method='GET',body)=>{const response=await fetch(base+endpoint,{method,headers:user?.headers,...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:response.status,data:await response.json()};};
 assert.equal((await req(null,'/api/kyb')).status,401);
 assert.equal((await req(agent,'/api/kyb')).status,403);
 assert.equal((await req(manager,'/api/kyb/session','POST',{})).status,403);
 assert.equal((await req({...owner,headers:{...owner.headers,'X-CSRF-Token':'bad'}},'/api/kyb/session','POST',{})).status,403);
 assert.equal((await req(owner,'/api/kyb/session','POST',{workflow_id:'own-workflow'})).status,400);
 const starts=await Promise.all([req(owner,'/api/kyb/session','POST',{}),req(owner,'/api/kyb/session','POST',{})]);
 assert.equal(starts[0].status,200);assert.equal(starts[1].status,200);assert.equal(calls,1);
 assert.equal(saved.workflow_id,config.workflowId);assert.equal(Object.hasOwn(saved,'api_key'),false);
 assert.equal((await req(other,'/api/kyb')).data.session,null);
 assert.equal(JSON.stringify(starts).includes(config.apiKey),false);
 assert.equal((await req(owner,'/api/kyb/refresh','POST',{})).data.session.status,'in_progress');
 remoteStatus='Approved';
 const event={event_id:randomUUID(),webhook_type:'status.updated',session_kind:'business',session_id:'session-one',application_id:config.applicationId,environment:'sandbox',workflow_id:config.workflowId,vendor_data:saved.vendor_data,status:'Declined'};
 const webhook=async(body,extra={})=>fetch(base+'/api/webhooks/didit',{method:'POST',headers:{'Content-Type':'application/json','x-timestamp':String(Math.floor(Date.now()/1000)),'x-signature-v2':digest(canonicalDidit(body)),...extra},body:JSON.stringify(body)});
 assert.equal((await webhook(event,{'x-signature-v2':'bad'})).status,401);
 assert.equal((await webhook({...event,environment:'live'})).status,403);
 assert.equal((await webhook({...event,vendor_data:'other-tenant'})).status,403);
 assert.equal((await webhook(event)).status,200);
 const after=await req(owner,'/api/kyb');assert.equal(after.data.session.status,'approved');assert.equal(after.data.verified,false);assert.equal(after.data.sandbox_verified,true);
 const previousCalls=decisionCalls;assert.equal((await webhook(event)).status,200);assert.equal(decisionCalls,previousCalls);
 remoteStatus='Declined';assert.equal((await webhook({...event,event_id:randomUUID()},{'x-didit-test-webhook':'true'})).status,200);
 assert.equal((await req(owner,'/api/kyb')).data.session.status,'approved');
 assert.equal((await req(other,'/api/kyb')).data.session,null);
 assert.equal(app.db.prepare('SELECT COUNT(*) count FROM didit_webhook_receipts').get().count,1);
 assert.equal((await fetch(base+'/didit.js')).status,200);
});
test('Uncertain session creation is not duplicated on retry; live sessions require server opt-in',async t=>{
 let count=0;
 const {diditService}=await import('./src/didit.mjs');const {openDatabase}=await import('./src/database.mjs');
 const db=openDatabase(':memory:');t.after(()=>db.close());
 db.prepare('INSERT INTO tenants VALUES (?,?)').run('tenant','Test');db.prepare('INSERT INTO users(id,email,password) VALUES (?,?,?)').run('user','test@invalid.example','disabled');
 const service=diditService({db,config,readBody:async()=>({}),json:()=>{},audit:()=>{},fetcher:async()=>{count++;throw Error('timeout');}});
 const s={tenant_id:'tenant',user_id:'user',role:'owner'},url=new URL('http://localhost/api/kyb/session');
 await assert.rejects(service.route({method:'POST'},{},url,s),error=>error.status===502);
 await assert.rejects(service.route({method:'POST'},{},url,s),error=>error.status===409);assert.equal(count,1);
 const live=diditService({db,config:{...config,environment:'live'},readBody:async()=>({}),json:()=>{},audit:()=>{}});
 assert.equal(live.overview('tenant').configured,false);
});
