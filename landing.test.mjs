import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from './server.mjs';
import {estimate,plans,customerRates} from './public/pricing.js';
import {monthlyCycle,usageService} from './src/ai-usage.mjs';
import {openDatabase} from './src/database.mjs';
import {publicOverage,billingService} from './src/billing.mjs';

test('quote e agenti AI: soglie, extra, arrotondamento e risparmio',()=>{
 const rates={minutes:.5,simple:.25,medium:2,complex:5}; // Test fixture, not merchant tariffs.
 const base={minutes:1238,simple:225,medium:50,complex:20};
 assert.equal(estimate('vip',1,base,rates).total,522);
 assert.equal(estimate('elite',2,base,rates).total,1045);
 assert.equal(estimate('vip',3,base,rates).extraAgents,200);
 assert.equal(estimate('elite',3,base,rates).extraAgents,50);
 const usage={minutes:2500,simple:300,medium:80,complex:25};
 assert.equal(estimate('vip',3,usage,rates).total,1456.75);
 assert.equal(estimate('elite',3,usage,rates).total,1095);
 assert.equal(estimate('vip',3,usage,rates).total-estimate('elite',3,usage,rates).total,361.75);
 assert.equal(estimate('vip',1,{...base,minutes:1239},{}).total,null);
 assert.equal(estimate('vip',1,base,{}).total,522);
 assert.equal(estimate('vip',1,{...base,simple:226},{simple:.123}).consumption,.12);
 assert.throws(()=>estimate('vip',-1,base,rates));
 assert.throws(()=>estimate('vip',1,{...base,minutes:NaN},rates));
 assert.throws(()=>estimate('pro',1,base,rates));
 assert.equal(plans.standard.annual,530);assert.equal(plans.pro.annual,1050);assert.equal(plans.vip.annual,5220);assert.equal(plans.elite.annual,10450);
});
test('configurazione pubblica espone solo tariffe finali valide',()=>{
 assert.deepEqual(publicOverage(),customerRates);
});
test('legacy checkout preserves KYB gate and redirects users to configured providers',async()=>{let status='pending';const route=billingService({db:{prepare:()=>({get:()=>({kyb_status:status})})},readBody:async r=>r.body,json:()=>{}}),s={role:'owner',tenant_id:'agency'},url=new URL('https://prime.example/api/billing/checkout'),req={method:'POST',body:{plan:'standard',cycle:'monthly',humans:2}};await assert.rejects(route(req,{},url,s),e=>e.status===403);status='approved';await assert.rejects(route(req,{},url,s),e=>e.status===503);});

test('HTTP: landing, asset, gestionale, account reale, CSRF e acquisto negato',async t=>{
 const {server,db}=createApp({database:':memory:'});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>{server.close(()=>{db.close();r();});}));
 const base=`http://127.0.0.1:${server.address().port}`;
 assert.equal((await fetch(base+'/src/provider-pricing.mjs')).status,404);
 const publicPricingSource=await(await fetch(base+'/pricing.js')).text();
 assert.doesNotMatch(publicPricingSource,/callMultiplier|llmMultiplier|callUsdPerMinute|llmUsdPerMinute/);
 for(const path of ['/','/app','/checkout?preview=1','/checkout.css','/checkout.js','/landing.css','/landing-composition.css','/landing.js','/pricing.js','/assets/prime-wordmark.svg','/assets/prime-hero-panorama.png','/assets/prime-professionals.png'])assert.equal((await fetch(base+path)).status,200,path);
 const html=await (await fetch(base+'/')).text();assert.match(html,/landing.js/);assert.doesNotMatch(html,/Guarda il video/);
 assert.doesNotMatch(html,/landing-reference\.png/);assert.match(html,/Conosci meglio PRIME/);
 const auth=await fetch(base+'/api/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'register',agency:'Agenzia test landing',email:'landing@example.test',password:'test-password-only-2026'})});
 assert.equal(auth.status,201);const registration=await auth.json();
 const token=new URL(registration.verification_url).searchParams.get('verify');
 assert.equal((await fetch(base+'/api/auth/verify-email',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})})).status,200);
 const login=await fetch(base+'/api/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'login',email:'landing@example.test',password:'test-password-only-2026'})});
 assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];
 const me=await(await fetch(base+'/api/me',{headers:{cookie}})).json();assert.ok(me.csrf);
 const status=await(await fetch(base+'/api/billing/status',{headers:{cookie}})).json();assert.equal(status.kyb,'unverified');assert.equal(status.canPay,false);
 const quote=await fetch(base+'/api/billing/enquiry',{method:'POST',headers:{cookie,'Content-Type':'application/json','X-CSRF-Token':me.csrf},body:JSON.stringify({message:'Franchising con cinque sedi e integrazioni dedicate.'})});assert.equal(quote.status,200);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM franchise_enquiries').get().n,1);
 for(const csrf of ['',me.csrf]){
  const denied=await fetch(base+'/api/billing/checkout',{method:'POST',headers:{cookie,'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify({plan:'elite',cycle:'monthly',ai:2,kyb:'approved'})});assert.equal(denied.status,403);
 }
 const anon=await fetch(base+'/api/billing/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(anon.status,401);
 assert.deepEqual(Object.keys(await(await fetch(base+'/api/public/pricing')).json()),['overage']);
});


test('tariffe cliente esatte e calcolo oltre soglia',()=>{
 const usage={minutes:2500,simple:300,medium:80,complex:25};
 const vip=estimate('vip',3,usage),elite=estimate('elite',3,usage);
 assert.equal(vip.consumption,476.15);assert.equal(vip.total,1198.15);
 assert.equal(elite.consumption,0);assert.equal(elite.total,1095);
 assert.equal(Math.round((vip.total-elite.total)*100)/100,103.15);
 assert.equal(estimate('vip',1,{minutes:1239,simple:226,medium:51,complex:21}).consumption,8.15);
});

test('registro AI: ciclo mensile anche per annuale, quote distinte, isolamento e idempotenza',t=>{
 const db=openDatabase(':memory:');t.after(()=>db.close());
 db.prepare('INSERT INTO tenants VALUES (?,?)').run('agency-a','A');db.prepare('INSERT INTO tenants VALUES (?,?)').run('agency-b','B');
 const service=usageService(db),anchor='2026-01-31T10:15:00.000Z';
 service.activate({tenantId:'agency-a',plan:'vip',billingAnchor:anchor,billingCycle:'annual'});
 service.activate({tenantId:'agency-b',plan:'elite',billingAnchor:anchor});
 assert.deepEqual(monthlyCycle(anchor,'2026-02-28T10:15:00.000Z'),{start:'2026-02-28T10:15:00.000Z',end:'2026-03-31T10:15:00.000Z'});
 const event={tenantId:'agency-a',eventId:'voice-1',agentId:'ai-1',kind:'minutes',units:1239,occurredAt:'2026-02-02T11:00:00.000Z'};
 assert.equal(service.record(event,new Date('2026-02-02T12:00Z')).recorded,true);
 assert.equal(service.record(event,new Date('2026-02-02T12:00Z')).duplicate,true);
 assert.throws(()=>service.record({...event,units:1240},new Date('2026-02-02T12:00Z')),e=>e.status===409);
 service.record({...event,eventId:'simple-1',agentId:'ai-2',kind:'simple',units:226},new Date('2026-02-02T12:00Z'));
 const summary=service.summary('agency-a','2026-02-03T11:00Z');
 assert.equal(summary.totalExtraEur,.49);assert.equal(summary.lines[0].extra,1);assert.equal(summary.lines[1].extra,1);assert.equal(summary.lines[2].remaining,50);
 assert.equal(service.summary('agency-b','2026-02-03T11:00Z').totalExtraEur,0);
 assert.equal(service.summary('agency-a','2026-02-28T10:15:00.000Z').lines[0].used,0);
 assert.equal(service.summary('agency-a','2026-02-28T10:15:00.000Z').lines[0].remaining,1238);
 assert.equal(service.events('agency-a','2026-02-03T11:00Z').length,2);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM ai_usage_ledger').get().n,2);
 assert.throws(()=>service.record({...event,eventId:'fraction',kind:'simple',units:.5},new Date('2026-02-02T12:00Z')));
});

// Verify billing policy and included-minute boundaries independently of the UI.
test('minuti extra: costo complessivo per tre e soglie dei due piani',async()=>{
 const {customerCallRate}=await import('./src/provider-pricing.mjs');
 assert.equal(customerCallRate(),Math.round((.08+.03)*3/1.1193*1e5)/1e5);
 assert.equal(customerRates.minutes,customerCallRate());
 for(const [id,quota,agents] of [['vip',1238,1],['elite',3738,2]]){
  assert.equal(estimate(id,agents,{minutes:quota-1}).consumption,0);
  assert.equal(estimate(id,agents,{minutes:quota}).consumption,0);
  assert.equal(estimate(id,agents,{minutes:quota+1}).consumption,.29);
  assert.equal(estimate(id,agents,{minutes:quota+100}).consumption,29.48);
 }
});
