import test from 'node:test';
import assert from 'node:assert/strict';
import {basePlanEur,grossPlanCents} from './src/plan-price-policy.mjs';
import {plans} from './public/pricing.js';
test('list prices preserve original net after maximum published fee scenario',()=>{
 for(const [id,base] of Object.entries(basePlanEur))for(const [cycle,months] of [['monthly',1],['annual',10]]){
  const cents=Math.round(plans[id][cycle]*100),net=base*months*100;
  assert.equal(cents,grossPlanCents(net));
  assert.ok(cents*9051-300000>=net*10000);
  assert.ok((cents-1)*9051-300000<net*10000);
 }
 for(const [id,field,base] of [['standard','humanExtra',50],['pro','humanExtra',25],['vip','aiExtra',100],['elite','aiExtra',50]])assert.equal(Math.round(plans[id][field]*100),grossPlanCents(base*100,0));
});
