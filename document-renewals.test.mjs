import test from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase} from './src/database.mjs';
import {documentRenewalService} from './src/document-renewals.mjs';
import {diditService} from './src/didit.mjs';

function setup(t){
 const db=openDatabase(':memory:');t.after(()=>db.close());
 for(const id of ['a','b']){db.prepare('INSERT INTO tenants VALUES (?,?)').run(id,id);db.prepare('INSERT INTO users(id,email,password) VALUES (?,?,?)').run(id,id+'@test.invalid','disabled');}
 function row(id,tenant='a',status='approved',environment='live',created='2026-01-01T00:00:00Z'){
  db.prepare('INSERT INTO didit_kyb_sessions(id,tenant_id,requested_by,environment,application_id,workflow_id,vendor_data,session_id,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(id,tenant,tenant,environment,'app','flow',id+'-vendor',id+'-session',status,created,created);
  return db.prepare('SELECT * FROM didit_kyb_sessions WHERE id=?').get(id);
 }
 return {db,row};
}

test('expiry notification respects the document date in Italy, is idempotent and scoped by agency/environment',t=>{
 const {db,row}=setup(t),service=documentRenewalService(db),verified=row('verified');
 service.capture(verified,{id_verifications:[{expiration_date:'2026-10-25'}]});
 service.capture(verified,{id_verifications:[{expiration_date:'2026-10-25'}]});
 assert.equal(db.prepare('SELECT count(*) n FROM agency_document_expiries').get().n,1);
 assert.equal(service.notifications('a','live',new Date('2026-10-25T22:59:59Z')).length,0);
 assert.equal(service.notifications('a','live',new Date('2026-10-25T23:00:00Z')).length,1);
 assert.equal(service.notifications('b','live',new Date('2026-10-26T10:00:00Z')).length,0);
 assert.equal(service.notifications('a','sandbox',new Date('2026-10-26T10:00:00Z')).length,0);
 row('new-approved','a','approved','live','2026-10-26T11:00:00Z');
 assert.equal(service.notifications('a','live',new Date('2026-10-26T12:00:00Z')).length,0);
});

test('verification-session expiry is not confused with document expiry; invalid dates are ignored',t=>{
 const {db,row}=setup(t),service=documentRenewalService(db);
 row('session-only','a','expired');assert.equal(service.notifications('a','live').length,0);
 const approved=row('approved','a','approved','live','2026-01-02T00:00:00Z');
 service.capture(approved,{document_verifications:[{expiration_date:'2026-02-31'},{expiration_date:'not-a-date'}]});
 assert.equal(service.notifications('a','live').length,0);
 row('monitored','a','kyc_expired','live','2026-01-03T00:00:00Z');
 assert.match(service.notifications('a','live')[0].message,/inviare i documenti aggiornati/);
});

test('renewal is owner-only, tenant-scoped and reuses the pending document submission session',async t=>{
 const {db,row}=setup(t);row('old','a','kyc_expired','sandbox');let result,created=0;
 const service=diditService({db,config:{apiKey:'test',workflowId:'flow',applicationId:'app',environment:'sandbox'},audit:()=>{},readBody:async()=>({}),json:(_res,_code,data)=>{result=data;},fetcher:async()=>{created++;return Response.json({session_id:'new-session',url:'https://verify.didit.me/new-session',status:'Not Started',environment:'sandbox',workflow_id:'flow'});}});
 const owner={tenant_id:'a',user_id:'a',role:'owner'},notifications=new URL('http://localhost/api/kyb/document-notifications'),renew=new URL('http://localhost/api/kyb/renew-documents');
 await service.route({method:'GET'},{},notifications,owner);assert.equal(result.items.length,1);assert.equal(result.canRenew,true);
 await service.route({method:'GET'},{},notifications,{...owner,role:'manager'});assert.equal(result.canRenew,false);
 await assert.rejects(service.route({method:'GET'},{},notifications,{...owner,role:'agent'}),e=>e.status===403);
 await service.route({method:'GET'},{},notifications,{tenant_id:'b',user_id:'b',role:'owner'});assert.equal(result.items.length,0);
 await assert.rejects(service.route({method:'POST'},{},renew,{...owner,role:'manager'}),e=>e.status===403);
 await assert.rejects(service.route({method:'POST'},{},renew,{tenant_id:'b',user_id:'b',role:'owner'}),e=>e.status===409);
 await service.route({method:'POST'},{},renew,owner);assert.match(result.session.url,/verify.didit.me/);
 await service.route({method:'POST'},{},renew,owner);assert.equal(created,1);
 assert.equal(service.overview('a').verified,false);
});
