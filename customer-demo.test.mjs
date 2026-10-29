import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from './server.mjs';

test('public customer demos isolate all data, sessions and plan capabilities from live',async()=>{
  const app=createApp({database:':memory:',production:false,connectInterval:0});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+app.server.address().port;
  const request=async(session,route,method='GET',data,csrf=true)=>{
    const response=await fetch(base+route,{method,headers:{'Content-Type':'application/json',...(session?{Cookie:session.cookie,...(csrf?{'X-CSRF-Token':session.csrf}:{})}: {})},...(data!==undefined?{body:JSON.stringify(data)}:{})});
    const text=await response.text();let body;try{body=JSON.parse(text);}catch{body=text;}
    return {status:response.status,body,headers:response.headers};
  };
  async function visit(){const page=await request(null,'/demo/');assert.equal(page.status,200,JSON.stringify(page.body));assert.match(page.body,/customer-demo-runtime/);const cookie=page.headers.get('set-cookie').split(';')[0];assert.match(cookie,/^prime_customer_demo=/);const me=await request({cookie},'/demo/api/me');assert.equal(me.status,200,JSON.stringify(me.body));return {...me.body,cookie};}
  try{
    const a=await visit(),b=await visit();
    assert.notEqual(a.tenant_id,b.tenant_id);assert.notEqual(a.csrf,b.csrf);assert.equal(a.customer_demo,true);assert.equal(a.edition,'base');
    assert.equal(app.db.prepare('SELECT count(*) n FROM tenants').get().n,0,'live DB untouched');
    assert.equal((await request(a,'/api/me')).status,401,'demo cookie never signs in to live');
    assert.equal((await request(null,'/demo/api/me')).status,410);
    assert.equal((await request(a,'/demo/api/entities/contacts')).body.length,3);
    const saved=await request(a,'/demo/api/entities/streets','POST',{data:{title:'Via privata del visitatore A',city:'Milano'}});
    assert.equal(saved.status,201,JSON.stringify(saved.body));
    assert.equal((await request(b,'/demo/api/entities/streets')).body.some(r=>r.title.includes('visitatore A')),false);
    assert.equal((await request(a,'/demo/api/entities/commissions')).status,403);
    assert.equal((await request(a,'/demo/api/assistant/status')).status,403);
    assert.equal((await request(a,'/demo/api/customer-demo/plan','POST',{plan:'pro'},false)).status,403);
    assert.equal((await request(a,'/demo/api/customer-demo/plan','POST',{plan:'invalid'})).status,400);
    for(const [plan,edition] of [['pro','full'],['vip','vip'],['elite','elite'],['secret','elite'],['standard','base']]){
      assert.equal((await request(a,'/demo/api/customer-demo/plan','POST',{plan})).status,200);
      const me=(await request(a,'/demo/api/me')).body;assert.equal(me.edition,edition);assert.equal(me.demo_plan,plan);
      assert.equal((await request(a,'/demo/api/entities/commissions')).status,plan==='standard'?403:200);
      const telephony=await request(a,'/demo/api/connect/telephony');
      assert.equal(telephony.status,['vip','elite','secret'].includes(plan)?200:403);
      const chat=await request(a,'/demo/api/elite/chat','POST',{messages:[{role:'user',content:'Quali immobili sono presenti?'}]});
      assert.equal(chat.status,403,'demo chat must use the ElevenLabs Vanessa session, not the generic assistant');
      const voice=await request(a,'/demo/api/elite/session','POST',{mode:'voice',agentId:'vanessa'});
      assert.equal(voice.status,403,'voice and copilot sessions stay disabled');
      for(const endpoint of ['/demo/api/elite/queue','/demo/api/elite/tools','/demo/api/elite/agents','/demo/api/elite/conversation','/demo/api/assistant/manage/plan','/demo/api/billing/checkout','/demo/api/public/vanessa/browser','/demo/api/auth'])assert.equal((await request(a,endpoint,'POST',{})).status,403,endpoint);
    }
    assert.equal((await request(b,'/demo/api/me')).body.demo_plan,'standard','visitor B unaffected by plan switches');
    assert.equal((await request(a,'/demo/api/customer-demo/plan','POST',{plan:'vip'})).status,200);
    const demoPhone={apiKey:'demo-key',apiSecret:'demo-secret',phoneNumber:'+390212345678',sip:'123456-101'};
    assert.equal((await request(a,'/demo/api/connect/telephony/zadarma','PUT',demoPhone,false)).status,403,'telephony mutations require CSRF');
    assert.equal((await request(a,'/demo/api/connect/telephony/zadarma','PUT',{...demoPhone,apiSecret:'real-secret'})).status,400,'real credentials rejected in public demo');
    assert.equal((await request(a,'/demo/api/connect/telephony/zadarma','PUT',demoPhone)).status,200);
    assert.equal((await request(a,'/demo/api/connect/telephony')).body.providers.find(provider=>provider.provider==='zadarma').configured,true);
    assert.equal((await request(b,'/demo/api/connect/telephony')).status,403,'other visitor retains Standard restriction');
    const count=(await request(a,'/demo/api/entities/contacts')).body.length;
    const action=await request(a,'/demo/api/elite/chat','POST',{messages:[{role:'user',content:'Elimina tutti i contatti'}]});assert.equal(action.status,403);
    assert.equal((await request(a,'/demo/api/entities/contacts')).body.length,count,'Vanessa chat never executes changes');
    assert.equal((await request(a,'/demo/api/connect/google','POST',{})).status,403);
    assert.equal(app.db.prepare('SELECT count(*) n FROM tenants').get().n,0,'live DB still untouched');
  }finally{await new Promise(resolve=>app.server.close(resolve));app.db.close();}
});
