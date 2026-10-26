import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { createApp } from './server.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');

test('Paid Standard receives only Standard while Pro keeps Veronica and Pro APIs',async()=>{
  const app=createApp({database:':memory:',edition:'full',production:true,demo:false});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${app.server.address().port}`;
  function account(plan,name){
    const tenant='tenant-'+name,user='user-'+name,token=randomBytes(32).toString('hex'),csrf=randomBytes(24).toString('hex');
    app.db.prepare('INSERT INTO tenants(id,name) VALUES (?,?)').run(tenant,'Agency '+name);
    app.db.prepare('INSERT INTO users(id,email,password,email_verified) VALUES (?,?,?,1)').run(user,name+'@example.test','not-used');
    app.db.prepare('INSERT INTO memberships(user_id,tenant_id,role) VALUES (?,?,?)').run(user,tenant,'owner');
    app.db.prepare('INSERT INTO sessions(token,user_id,tenant_id,expires,csrf) VALUES (?,?,?,?,?)').run(hash(token),user,tenant,Date.now()+60000,csrf);
    app.db.prepare('INSERT INTO plan_subscriptions(tenant_id,plan,cycle,period_start,period_end,paid_plan_cents,payment_reference,revision,state) VALUES (?,?,?,?,?,?,?,?,?)').run(tenant,plan,'monthly','2026-01-01T00:00:00.000Z','2099-01-01T00:00:00.000Z',plan==='standard'?5300:10500,'paid-'+name,1,'active');
    return {cookie:'prime_session='+token,csrf};
  }
  async function request(session,path,method='GET',body){const response=await fetch(origin+path,{method,headers:{Cookie:session.cookie,'Content-Type':'application/json','X-CSRF-Token':session.csrf},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,body:await response.json()};}
  try{
    const standard=account('standard','standard'),pro=account('pro','pro');
    const standardMe=await request(standard,'/api/me');
    assert.equal(standardMe.body.edition,'base');
    assert.equal(standardMe.body.human_seat_limit,2);
    assert.equal((await request(standard,'/api/assistant/status')).status,403);
    assert.equal((await request(standard,'/api/entities/commissions')).status,403);
    assert.equal((await request(standard,'/api/elite/status')).status,403);
    assert.equal((await request(pro,'/api/me')).body.edition,'full');
    assert.equal((await request(pro,'/api/assistant/status')).status,200);
    assert.equal((await request(pro,'/api/entities/commissions')).status,200);
  }finally{await new Promise(resolve=>app.server.close(resolve));app.db.close();}
});
