import {plans,customerRates,usageKeys,chargeCents} from '../public/pricing.js';
import {customerCallRate} from './provider-pricing.mjs';
import {ApiError} from './validation.mjs';

const iso=date=>new Date(date).toISOString();
function anniversary(anchor,offset){
 const month=anchor.getUTCMonth()+offset;
 const first=new Date(Date.UTC(anchor.getUTCFullYear(),month,1,anchor.getUTCHours(),anchor.getUTCMinutes(),anchor.getUTCSeconds(),anchor.getUTCMilliseconds()));
 const last=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate();
 first.setUTCDate(Math.min(anchor.getUTCDate(),last));return first;
}
export function monthlyCycle(anchorValue,atValue=new Date()){
 const anchor=new Date(anchorValue),at=new Date(atValue);
 if(!Number.isFinite(+anchor)||!Number.isFinite(+at)||at<anchor)throw new ApiError(400,'Data del ciclo non valida');
 let n=(at.getUTCFullYear()-anchor.getUTCFullYear())*12+at.getUTCMonth()-anchor.getUTCMonth();
 if(anniversary(anchor,n)>at)n--;
 return {start:iso(anniversary(anchor,n)),end:iso(anniversary(anchor,n+1))};
}
export function usageService(db){
 function subscription(tenantId){const s=db.prepare('SELECT * FROM ai_subscriptions WHERE tenant_id=?').get(tenantId);if(!s||s.state!=='active')throw new ApiError(403,'Nessun abbonamento AI attivo');return s;}
 return {
  // Internal provider hook only: call after validating the actual payment event.
  activate({tenantId,plan,billingAnchor,billingCycle='monthly'}){
   if(!['vip','elite'].includes(plan)||!['monthly','annual'].includes(billingCycle))throw new ApiError(400,'Abbonamento AI non valido');
   const anchor=iso(billingAnchor);monthlyCycle(anchor,anchor);
   const old=db.prepare('SELECT * FROM ai_subscriptions WHERE tenant_id=?').get(tenantId);
   if(old&&old.billing_anchor!==anchor)throw new ApiError(409,'La modifica dell’ancoraggio richiede una migrazione del ciclo');
   if(old&&old.plan!==plan)throw new ApiError(409,'Il cambio piano richiede la riconciliazione del ciclo corrente');
   db.prepare("INSERT INTO ai_subscriptions VALUES (?,?,?,?,'active') ON CONFLICT(tenant_id) DO UPDATE SET billing_cycle=excluded.billing_cycle,state='active'").run(tenantId,plan,anchor,billingCycle);
  },
  // Never expose this method to an unauthenticated or client-reported usage API.
  record({tenantId,eventId,agentId,kind,units,occurredAt=new Date().toISOString()},now=new Date()){
   if(!usageKeys.includes(kind)||typeof eventId!=='string'||!eventId.trim()||eventId.length>200||typeof agentId!=='string'||!agentId.trim()||agentId.length>128)throw new ApiError(400,'Evento AI non valido');
   if(typeof units!=='number'||!Number.isFinite(units)||units<=0||units>10000000||(kind!=='minutes'&&!Number.isSafeInteger(units)))throw new ApiError(400,'Quantità di consumo non valida');
   const micros=Math.round(units*1000000);if(!Number.isSafeInteger(micros)||micros===0)throw new ApiError(400,'Precisione di consumo non valida');
   const s=subscription(tenantId),when=new Date(occurredAt);if(!Number.isFinite(+when)||+when>+new Date(now)+60000)throw new ApiError(400,'Data del consumo non valida');
   const cycle=monthlyCycle(s.billing_anchor,when);
   const prior=db.prepare('SELECT * FROM ai_usage_ledger WHERE tenant_id=? AND event_id=?').get(tenantId,eventId);
   if(prior){if(prior.agent_id!==agentId||prior.kind!==kind||prior.units_micros!==micros||prior.occurred_at!==iso(when))throw new ApiError(409,'Evento duplicato con dati diversi');return {recorded:false,duplicate:true};}
   const result=db.prepare('INSERT INTO ai_usage_ledger(tenant_id,event_id,agent_id,kind,units_micros,occurred_at,cycle_start,cycle_end) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(tenant_id,event_id) DO NOTHING').run(tenantId,eventId,agentId,kind,micros,iso(when),cycle.start,cycle.end);
   return {recorded:Number(result.changes)===1,cycle};
  },
  summary(tenantId,at=new Date()){
   const s=subscription(tenantId),cycle=monthlyCycle(s.billing_anchor,at),p=plans[s.plan];
   const totals=db.prepare('SELECT kind,SUM(units_micros) AS amount FROM ai_usage_ledger WHERE tenant_id=? AND cycle_start=? GROUP BY kind').all(tenantId,cycle.start);
   const lines=usageKeys.map((kind,i)=>{
    const micros=totals.find(x=>x.kind===kind)?.amount||0,quota=p.quotas[i],extra=Math.max(0,micros-quota*1000000);
    const rate=kind==='minutes'?customerCallRate():customerRates[kind];
    const cents=chargeCents(extra/1000000,rate);
    return {kind,used:micros/1000000,included:quota,remaining:Math.max(0,quota-micros/1000000),extra:extra/1000000,rate,extraEur:cents/100};
   });
   return {plan:s.plan,billingCycle:s.billing_cycle,cycle,lines,totalExtraEur:Math.round(lines.reduce((sum,x)=>sum+x.extraEur,0)*100)/100};
  },
  events(tenantId,at=new Date()){
   const s=subscription(tenantId),cycle=monthlyCycle(s.billing_anchor,at);
   return db.prepare('SELECT event_id AS eventId,agent_id AS agentId,kind,units_micros/1000000.0 AS units,occurred_at AS date FROM ai_usage_ledger WHERE tenant_id=? AND cycle_start=? ORDER BY occurred_at DESC,id DESC LIMIT 100').all(tenantId,cycle.start);
  }
 };
}
