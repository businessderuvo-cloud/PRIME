import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { upgradeQuote } from './src/plan-upgrades.mjs';
import { createApp } from './server.mjs';

const paid={plan:'standard',cycle:'monthly',period_start:'2028-02-01T12:00:00Z',period_end:'2028-03-01T12:00:00Z',paid_plan_cents:5300,payment_reference:'confirmed-fixture',state:'active'};
test('upgrade prorates actual monthly and annual cycles, including leap years',()=>{
  const halfway=(Date.parse(paid.period_start)+Date.parse(paid.period_end))/2;
  const q=upgradeQuote(paid,'pro',halfway);
  assert.equal(q.creditCents,2650);assert.equal(q.chargeCents,5541);assert.equal(q.dueCents,2891);assert.equal(q.renewalCents,11082);assert.equal(q.periodEnd,paid.period_end);
  const annual={...paid,cycle:'annual',paid_plan_cents:53000,period_start:'2028-01-01T00:00:00Z',period_end:'2029-01-01T00:00:00Z'};
  const middle=(Date.parse(annual.period_start)+Date.parse(annual.period_end))/2;
  assert.equal(upgradeQuote(annual,'pro',middle).dueCents,28760);
  assert.equal(upgradeQuote(annual,'elite',middle).dueCents,525942);
  assert.equal(upgradeQuote(paid,'vip',Date.parse(paid.period_start)).dueCents,49976);
  assert.equal(upgradeQuote({...paid,paid_plan_cents:5000},'pro',halfway).creditCents,2500);
});
test('upgrade rejects unavailable, expired, future, malformed and lower-tier subscriptions',()=>{
  for (const bad of [null,{...paid,state:'suspended'},{...paid,payment_reference:''},{...paid,period_end:paid.period_start},{...paid,paid_plan_cents:NaN}]) assert.throws(()=>upgradeQuote(bad,'pro',Date.parse(paid.period_start)));
  assert.throws(()=>upgradeQuote(paid,'pro',Date.parse(paid.period_end)));
  assert.throws(()=>upgradeQuote(paid,'pro',Date.parse(paid.period_start)-1));
  for(const target of ['standard','secret','invalid','__proto__'])assert.throws(()=>upgradeQuote(paid,target,Date.parse(paid.period_start)));
});
test('Base upgrade endpoints bind quotes to verified paid cycles and never grant access from client amounts',async()=>{
  const app=createApp({edition:'base',database:':memory:',connectInterval:0});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+app.server.address().port;
  function user(role='owner'){
    const tenant=randomUUID(),id=randomUUID(),token=randomBytes(32).toString('hex'),csrf=randomBytes(32).toString('hex');
    app.db.prepare('INSERT INTO tenants(id,name) VALUES (?,?)').run(tenant,'Upgrade test');
    app.db.prepare('INSERT INTO users(id,email,password) VALUES (?,?,?)').run(id,id+'@example.test','disabled-test-password');
    app.db.prepare('INSERT INTO memberships(user_id,tenant_id,role) VALUES (?,?,?)').run(id,tenant,role);
    app.db.prepare('INSERT INTO sessions(token,user_id,tenant_id,expires,csrf) VALUES (?,?,?,?,?)').run(createHash('sha256').update(token).digest('hex'),id,tenant,Date.now()+600000,csrf);
    return {tenant,cookie:'prime_session='+token,csrf};
  }
  async function request(s,path,body){const r=await fetch(origin+path,{method:body?'POST':'GET',headers:{Cookie:s.cookie,'X-CSRF-Token':s.csrf,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()};}
  try {
    const a=user(),b=user(),agent=user('agent');
    assert.equal((await request(a,'/api/billing/upgrade')).body.subscription,null);
    assert.equal((await request(agent,'/api/billing/upgrade')).status,403);
    assert.equal((await request(a,'/api/billing/upgrade/quote',{plan:'pro'})).status,403);
    for(const s of [a,b])app.db.prepare("INSERT INTO agency_billing(tenant_id,kyb_status) VALUES (?,'approved')").run(s.tenant);
    assert.equal((await request(a,'/api/billing/upgrade/quote',{plan:'pro'})).status,409);
    const start=new Date(Date.now()-15*86400000).toISOString(),end=new Date(Date.now()+15*86400000).toISOString();
    for(const s of [a,b])app.db.prepare("INSERT INTO plan_subscriptions(tenant_id,plan,cycle,period_start,period_end,paid_plan_cents,payment_reference,state) VALUES (?,'standard','monthly',?,?,5300,'test-paid','active')").run(s.tenant,start,end);
    const result=await request(a,'/api/billing/upgrade/quote',{plan:'pro',dueCents:1,periodEnd:'2099-01-01',cycle:'annual'});
    assert.equal(result.status,200);assert.equal(result.body.dueCents,2891);assert.equal(result.body.cycle,'monthly');assert.equal(result.body.periodEnd,end);
    const id=result.body.id;
    assert.equal((await request(b,'/api/billing/upgrade/request',{quoteId:id})).status,409);
    const accepted=await request(a,'/api/billing/upgrade/request',{quoteId:id,dueCents:0,edition:'full'});
    assert.equal(accepted.status,200);assert.equal(accepted.body.dueCents,2891);assert.equal(accepted.body.paymentUrl,null);
    assert.equal((await request(a,'/api/billing/upgrade/request',{quoteId:id})).status,200);
    assert.equal(app.db.prepare('SELECT plan FROM plan_subscriptions WHERE tenant_id=?').get(a.tenant).plan,'standard');
    assert.equal((await request(a,'/api/me')).body.edition,'base');
    app.db.prepare('UPDATE plan_subscriptions SET revision=revision+1 WHERE tenant_id=?').run(a.tenant);
    assert.equal((await request(a,'/api/billing/upgrade/request',{quoteId:id})).status,409);
    const next=await request(a,'/api/billing/upgrade/quote',{plan:'elite'});
    app.db.prepare('UPDATE plan_upgrade_quotes SET expires_at=0 WHERE id=?').run(next.body.id);
    assert.equal((await request(a,'/api/billing/upgrade/request',{quoteId:next.body.id})).status,409);
  } finally {await new Promise(resolve=>app.server.close(resolve));app.db.close();}
});
