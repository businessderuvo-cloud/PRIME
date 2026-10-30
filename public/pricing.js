export const plans = {
  standard: { name: 'Standard', monthly: 53, annual: 530, humans: 2, humanExtra: 50 },
  pro: { name: 'Pro', monthly: 105, annual: 1050, humans: 10, humanExtra: 25 },
  vip: { name: 'VIP', monthly: 522, annual: 5220, humans: null, ai: 1, aiExtra: 100, quotas: [1238,225,50,20] },
  elite: { name: 'Elite', monthly: 1045, annual: 10450, humans: null, ai: 2, aiExtra: 50, quotas: [3738,675,150,60] },
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
