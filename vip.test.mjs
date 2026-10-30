import test from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase} from './src/database.mjs';
import {eliteService} from './src/elite.mjs';
import {usageService} from './src/ai-usage.mjs';

function fixture(edition='vip'){
  const db=openDatabase(':memory:');
  db.prepare('INSERT INTO tenants(id,name) VALUES (?,?)').run('vip-test','VIP test');
  db.prepare('INSERT INTO users(id,email,password,email_verified) VALUES (?,?,?,1)').run('owner','vip@example.test','not-used');
  db.prepare('INSERT INTO memberships(user_id,tenant_id,role) VALUES (?,?,?)').run('owner','vip-test','owner');
  const session={tenant_id:'vip-test',user_id:'owner',role:'owner'},replies=[];
  let body={},providerCalls=0;
  const planned=[];
  const service=eliteService({db,edition,env:{PRIME_ELEVEN_LIVE_AGENT_ID:'agent_live',PRIME_ELEVEN_API_KEY:'test-only'},json:(_res,status,payload)=>replies.push({status,payload}),readBody:async()=>body,audit:()=>{},management:{plan:(s,input)=>{planned.push({s,input});return {proposal:{id:'pending-proposal',status:'pending'}};}},rows:()=>[],authorize:()=>{},fetcher:async()=>{providerCalls++;return {ok:true,json:async()=>({signed_url:'wss://api.elevenlabs.io/test'})};}});
  return {db,service,session,replies,planned,get providerCalls(){return providerCalls;},async request(path,method='GET',value={}){body=value;await service.route({method},{},new URL('https://prime.test/api/elite'+path),session);return replies.at(-1);}};
}

test('VIP exposes one AI, VIP prices and quotas, and blocks free agents and custom voices on server',async()=>{
  const f=fixture();
  try{
    const {payload}=await f.request('/status');
    assert.equal(payload.plan,'vip');assert.equal(payload.includedAgents,1);assert.equal(payload.customIncluded,0);assert.equal(payload.additionalAgentMonthly,110.49);assert.equal(payload.customVoiceAllowed,false);assert.deepEqual(payload.quotas,[1238,225,50,20]);
    for(const [path,method,body] of [['/agents','POST',{name:'Extra',personality:'Test'}],['/voices','GET',{}],['/session','POST',{mode:'copilot',agentId:'custom-agent'}]])await assert.rejects(f.request(path,method,body),e=>e.status===403);
    assert.equal(f.providerCalls,0);
    await assert.rejects(f.service.route({method:'GET'},{},new URL('https://prime.test/api/elite/status'),{...f.session,role:'external'}),e=>e.status===403);
    usageService(f.db).activate({tenantId:f.session.tenant_id,plan:'vip',billingAnchor:new Date().toISOString()});
    const usage=(await f.request('/usage')).payload;assert.deepEqual(usage.lines.map(line=>line.included),[1238,225,50,20]);
  }finally{f.db.close();}
});

test('VIP copilot listens privately and prepares data changes for confirmation',async()=>{
  const f=fixture();
  try{
    const result=(await f.request('/session','POST',{mode:'copilot'})).payload;
    assert.match(result.dynamicVariables.call_instructions,/PRIVATE LIVE CALL COPILOT/);
    assert.equal(f.db.prepare('SELECT scope FROM elite_access_tokens').get().scope,'copilot');
    const proposal=f.service.tool({...f.session,scope:'copilot'},{operation:'propose',entity:'contacts',action:'create',data_json:JSON.stringify({title:'Test live'})});
    assert.equal(proposal.proposal.status,'pending');assert.equal(f.planned.length,1);assert.equal(f.planned[0].s.tenant_id,'vip-test');assert.equal(f.planned[0].input.data.title,'Test live');
    assert.throws(()=>f.service.tool({...f.session,scope:'phone'},{operation:'propose',entity:'contacts'}),e=>e.status===403);
    assert.deepEqual(f.service.tool({...f.session,scope:'copilot'},{operation:'read',entity:'contacts'}).records,[]);
  }finally{f.db.close();}
});

test('VIP paid and AI plans must match in shared production; Elite keeps its larger allowance',async()=>{
  const f=fixture('full');
  try{
    const service=eliteService({db:f.db,edition:'full',env:{NODE_ENV:'production'},json:(_res,status,payload)=>f.replies.push({status,payload}),readBody:async()=>({}),audit:()=>{},management:{},rows:()=>[],authorize:()=>{}});
    const request=()=>service.route({method:'GET'},{},new URL('https://prime.test/api/elite/status'),f.session);
    const anchor=new Date().toISOString();
    f.db.prepare("INSERT INTO plan_subscriptions(tenant_id,plan,cycle,period_start,period_end,paid_plan_cents,payment_reference,revision,state) VALUES (?,?,?,?,?,?,?,?,?)").run('vip-test','vip','monthly',anchor,'2099-01-01T00:00:00.000Z',52200,'test',1,'active');
    await assert.rejects(request(),e=>e.status===403);
    usageService(f.db).activate({tenantId:'vip-test',plan:'vip',billingAnchor:anchor});
    await request();assert.equal(f.replies.at(-1).payload.plan,'vip');
    f.db.prepare("UPDATE plan_subscriptions SET plan='pro'").run();await assert.rejects(request(),e=>e.status===403);
  }finally{f.db.close();}
  const elite=fixture('elite');
  try{const status=(await elite.request('/status')).payload;assert.equal(status.includedAgents,2);assert.equal(status.additionalAgentMonthly,55.25);assert.equal(status.customVoiceAllowed,true);}finally{elite.db.close();}
});
