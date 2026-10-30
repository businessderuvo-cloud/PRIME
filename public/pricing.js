export const plans = {
  standard: { name: 'Standard', monthly: 55.58, annual: 552.76, humans: 2, humanExtra: 55.25 },
  pro: { name: 'Pro', monthly: 110.82, annual: 1105.19, humans: 10, humanExtra: 27.63 },
  vip: { name: 'VIP', monthly: 552.76, annual: 5524.59, humans: null, ai: 1, aiExtra: 110.49, quotas: [1238,225,50,20] },
  elite: { name: 'Elite', monthly: 1105.19, annual: 11048.84, humans: null, ai: 2, aiExtra: 55.25, quotas: [3738,675,150,60] },
};
export const usageKeys = ['minutes','simple','medium','complex'];
// Final EUR tariff per excess minute includes both voice and AI processing.
// Within each plan's minutes, both components are included. No provider costs here.
export const customerRates = Object.freeze({minutes:0.29483,simple:0.2025,medium:2.025,complex:5.625});
export function chargeCents(units,rate){
 const quantity=BigInt(Math.round(units*1000000)),price=BigInt(Math.round(rate*100000));
 return Number((quantity*price+500000000n)/1000000000n);
}
export function estimate(planId, agents, usage, rates = customerRates) {
  const p = plans[planId];
  if (!p?.quotas) throw new RangeError('Piano AI non valido');
  const count = Number(agents);
  if (!Number.isSafeInteger(count) || count < 1 || count > 1000) throw new RangeError('Numero agenti AI non valido');
  const extraAgents = Math.max(0,count-p.ai)*p.aiExtra;
  const extras = usageKeys.map((key,i) => {
    const value=Number(usage[key] ?? 0);
    if (!Number.isSafeInteger(value) || value<0 || value>10000000) throw new RangeError('Consumo non valido');
    const units=Math.max(0,value-p.quotas[i]);
    const rate=rates[key];
    return {key,units,cents:units===0 ? 0 : Number.isFinite(rate)&&rate>=0 ? chargeCents(units,rate) : null};
  });
  const complete=extras.every(x=>x.cents!==null);
  const consumptionCents=complete ? extras.reduce((a,x)=>a+x.cents,0) : null;
  const consumption=complete ? consumptionCents/100 : null;
  return {base:p.monthly,extraAgents,extras,consumption,subtotal:p.monthly+extraAgents,total:complete?((p.monthly+extraAgents)*100+consumptionCents)/100:null};
}
