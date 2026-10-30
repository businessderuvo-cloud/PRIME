// Private commercial policy, approved 2026-10-30: preserve original net bases
// using the highest published enabled-method scenario, rather than card pricing.
// Klarna US/Canada 5.99% + EUR .30, international 1.5%, FX 2%, Billing .7%.
// This is a conservative list-price assumption, not the account's negotiated rate.
export const basePlanEur = Object.freeze({standard:50,pro:100,vip:500,elite:1000});
export function grossPlanCents(netCents, fixedCents=30){
  if(!Number.isSafeInteger(netCents)||netCents<0)throw new RangeError('Invalid net price');
  return Math.ceil((netCents+fixedCents)*10000/9051);
}
