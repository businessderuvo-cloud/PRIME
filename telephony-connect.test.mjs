import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,createHash} from 'node:crypto';
import {openDatabase} from './src/database.mjs';
import {createVault} from './src/connect/store.mjs';
import {telephonyService} from './src/connect/telephony.mjs';

test('telephony verifies provider credentials, encrypts tenant settings and enforces plans and roles',async()=>{
  const db=openDatabase(':memory:'),vault=createVault(),requests=[];
  db.prepare('INSERT INTO tenants VALUES (?,?)').run('agency-a','A');
  db.prepare('INSERT INTO tenants VALUES (?,?)').run('agency-b','B');
  db.prepare('INSERT INTO users(id,email,password,email_verified) VALUES (?,?,?,1)').run('owner','owner@example.invalid','unused');
  let edition='vip',reply;
  const service=telephonyService({db,vault,editionFor:()=>edition,json:(_response,status,body)=>{reply={status,body};},readBody:async request=>request.body,audit:()=>{},fetcher:async(url,options)=>{requests.push({url,options});return {ok:true,json:async()=>url.includes('zadarma')?{status:'success'}:{responseData:{data:[]}}};}});
  const session={tenant_id:'agency-a',user_id:'owner',role:'owner'},body={apiKey:'my-key',apiSecret:'my-secret',phoneNumber:'+390212345678',sip:'123456-101'};
  const call=(provider,method='PUT',payload=body,who=session)=>service.route({method,body:payload},{},new URL('http://localhost/api/connect/telephony'+(provider?'/'+provider:'')),who);
  try{
    edition='full';await assert.rejects(call('zadarma'),error=>error.status===403||error.message.includes('VIP'));assert.equal(requests.length,0);
    edition='vip';await assert.rejects(call('zadarma','PUT',body,{...session,role:'agent'}));assert.equal(requests.length,0);
    await assert.rejects(call('zadarma','PUT',{...body,phoneNumber:'invalid'}));assert.equal(requests.length,0);
    await call('zadarma');assert.equal(reply.status,200);assert.equal(reply.body.demo,false);
    const expected=Buffer.from(createHmac('sha1','my-secret').update('/v1/info/balance/'+createHash('md5').update('').digest('hex')).digest('hex')).toString('base64');
    assert.equal(requests[0].options.headers.Authorization,'my-key:'+expected);assert.equal(requests[0].options.redirect,'error');
    const stored=db.prepare('SELECT credentials_cipher FROM telephony_settings WHERE tenant_id=?').get('agency-a');assert.ok(!stored.credentials_cipher.includes('my-secret'));
    assert.equal(service.credentials(session,'zadarma').apiSecret,'my-secret');
    assert.equal(service.credentials({...session,tenant_id:'agency-b'},'zadarma'),null);
    await call('cloudtalk');assert.equal(requests[1].url,'https://my.cloudtalk.io/api/agents/index.json');assert.equal(requests[1].options.headers.Accept,'application/json');assert.equal(requests[1].options.headers.Authorization,'Basic '+Buffer.from('my-key:my-secret').toString('base64'));
    await call('', 'GET');assert.equal(reply.body.providers.filter(provider=>provider.configured).length,2);assert.ok(!JSON.stringify(reply.body).includes('my-secret'));assert.ok(!JSON.stringify(reply.body).includes('my-key'));
    await call('zadarma','DELETE',{});assert.equal(service.credentials(session,'zadarma'),null);
    const failed=telephonyService({db,vault,editionFor:()=>edition,json:()=>{},readBody:async req=>req.body,audit:()=>{},fetcher:async()=>({ok:false,status:401})});
    await assert.rejects(failed.route({method:'PUT',body},{},new URL('http://localhost/api/connect/telephony/zadarma'),session));assert.equal(service.credentials(session,'zadarma'),null);
  }finally{db.close();}
});

test('public demo simulates setup, rejects real credentials, and never contacts a provider',async()=>{
  const db=openDatabase(':memory:'),vault=createVault();let reply;
  db.prepare('INSERT INTO tenants VALUES (?,?)').run('agency','Demo');
  db.prepare('INSERT INTO users(id,email,password,email_verified) VALUES (?,?,?,1)').run('owner','owner@example.invalid','unused');
  const session={tenant_id:'agency',user_id:'owner',role:'owner'};
  const service=telephonyService({db,vault,demo:true,editionFor:()=> 'elite',json:(_res,_status,body)=>{reply=body;},readBody:async req=>req.body,audit:()=>{},fetcher:async()=>{throw Error('Must never contact provider');}});
  const url=new URL('http://localhost/api/connect/telephony/cloudtalk');
  try{
    await assert.rejects(service.route({method:'PUT',body:{apiKey:'real-key',apiSecret:'real-secret',phoneNumber:'+390212345678'}},{},url,session));
    await service.route({method:'PUT',body:{apiKey:'demo-key',apiSecret:'demo-secret',phoneNumber:'+390212345678'}},{},url,session);
    assert.equal(reply.demo,true);assert.equal(reply.configured,true);assert.equal(service.credentials(session,'cloudtalk'),null);
  }finally{db.close();}
});
