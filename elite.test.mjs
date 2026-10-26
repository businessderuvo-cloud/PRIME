import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from './src/database.mjs';
import { livePhone, inboundPhone, eliteModel, eliteEditionAllowed, eliteService } from './src/elite.mjs';

test('Elite fixes Vanessa LIVE to the ElevenLabs GPT 6.1 Sol model',()=>{
  assert.equal(eliteModel,'gpt-6.1-sol');
});

test('Elite has a standalone edition while the shared app still requires an active subscription',()=>{
  assert.equal(eliteEditionAllowed({edition:'elite',production:true}),true);
  assert.equal(eliteEditionAllowed({edition:'full',production:true,activeSubscription:false}),false);
  assert.equal(eliteEditionAllowed({edition:'full',production:true,activeSubscription:true}),true);
  assert.equal(eliteEditionAllowed({edition:'full',production:false}),false);
});

test('Elite routes stay unavailable to Standard/Pro accounts in the shared production app',async()=>{
  const db=openDatabase(':memory:');
  try{
    db.prepare('INSERT INTO tenants(id,name) VALUES (?,?)').run('edition-test','PRIME');
    const responses=[];
    const make=edition=>eliteService({db,json:(_res,status,payload)=>responses.push({status,payload}),readBody:async()=>({}),audit:()=>{},management:{},rows:()=>[],authorize:()=>{},edition,env:{NODE_ENV:'production'}});
    const req={method:'GET'},res={},url=new URL('https://prime.test/api/elite/status'),session={tenant_id:'edition-test',user_id:'owner',role:'owner'};
    await assert.rejects(make('full').route(req,res,url,session),error=>error.status===403);
    assert.equal(await make('elite').route(req,res,url,session),true);
    assert.equal(responses.at(-1).payload.name,'Vanessa');
  }finally{db.close();}
});

test('Elite phone numbers normalize and reject local or malformed values',()=>{
  assert.equal(livePhone('+39 (333) 123-4567'),'+393331234567');
  assert.equal(livePhone('0039 333 1234567'),'+393331234567');
  assert.throws(()=>livePhone('3331234567'),/numero internazionale/);
  assert.throws(()=>livePhone('+00000000'),/numero internazionale/);
});

test('ElevenLabs SIP inbound numbers accept the assigned short trunk number safely',()=>{
  assert.equal(inboundPhone('970824'),'970824');
  assert.equal(inboundPhone('+39 (02) 1234-5678'),'+390212345678');
  assert.equal(inboundPhone('sip:970824@example.com'),'');
  assert.equal(inboundPhone('12'),'');
});

test('Elite database migrations create settings, consented call queue and conversation ledger',()=>{
  const db=openDatabase(':memory:');
  try{
    for(const table of ['elite_settings','elite_agents','elite_access_tokens','elite_call_queue','elite_conversations'])
      assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table),table);
  }finally{db.close();}
});
