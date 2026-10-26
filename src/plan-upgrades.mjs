import { randomUUID } from 'node:crypto';
import { plans } from '../public/pricing.js';
import { ApiError } from './validation.mjs';

const rank = ['standard','pro','vip','elite'];
const prorate = (cents, remaining, duration) => Number((BigInt(cents)*BigInt(remaining)+BigInt(duration)/2n)/BigInt(duration));
export function upgradeQuote(subscription, target, now = Date.now()) {
  if (!subscription || subscription.state !== 'active' || !subscription.payment_reference) throw new ApiError(409,'Il ciclo dell’abbonamento pagato non è ancora disponibile. Contatta l’assistenza per l’upgrade.');
  if (!Object.hasOwn(plans,target) || rank.indexOf(target) <= rank.indexOf(subscription.plan)) throw new ApiError(400,'Scegli un piano superiore a quello attuale.');
  const start = Date.parse(subscription.period_start), end = Date.parse(subscription.period_end);
  if (!Number.isSafeInteger(now) || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || end <= start || now < start || now >= end || !Number.isSafeInteger(subscription.paid_plan_cents) || subscription.paid_plan_cents < 0 || !['monthly','annual'].includes(subscription.cycle)) throw new ApiError(409,'Il ciclo di fatturazione deve essere aggiornato prima dell’upgrade.');
  const nextCents = plans[target][subscription.cycle === 'annual' ? 'annual' : 'monthly']*100;
  const remaining = end-now, duration = end-start;
  const creditCents = prorate(subscription.paid_plan_cents,remaining,duration);
  const chargeCents = prorate(nextCents,remaining,duration);
  return { from:subscription.plan, to:target, cycle:subscription.cycle, periodStart:subscription.period_start, periodEnd:subscription.period_end, effectiveAt:new Date(now).toISOString(), remainingMs:remaining, durationMs:duration, creditCents, chargeCents, dueCents:Math.max(0,chargeCents-creditCents), renewalCents:nextCents, scope:'plan_fee' };
}

export function planUpgradeService({db,json,readBody,env=process.env,clock=Date.now}) {
  return async (req,res,url,s) => {
    if (!url.pathname.startsWith('/api/billing/upgrade')) return false;
    if (s.role !== 'owner') throw new ApiError(403,'Solo il titolare può gestire l’upgrade.');
    const subscription=db.prepare('SELECT * FROM plan_subscriptions WHERE tenant_id=?').get(s.tenant_id);
    const approved=db.prepare('SELECT kyb_status FROM agency_billing WHERE tenant_id=?').get(s.tenant_id)?.kyb_status === 'approved';
    if (url.pathname==='/api/billing/upgrade' && req.method==='GET') {
      json(res,200,{subscription:subscription?{plan:subscription.plan,cycle:subscription.cycle,periodStart:subscription.period_start,periodEnd:subscription.period_end,state:subscription.state}:null,approved,plans:Object.entries(plans).map(([id,p])=>({id,name:p.name,monthly:p.monthly,annual:p.annual})),support:'phoenix@primegestionale.it'});return true;
    }
    if (!approved) throw new ApiError(403,'Prima dell’upgrade è necessaria la verifica aziendale approvata.');
    const body=await readBody(req), now=clock();
    if (url.pathname==='/api/billing/upgrade/quote' && req.method==='POST') {
      const quote=upgradeQuote(subscription,body.plan,now),id=randomUUID(),expiresAt=Math.min(now+5*60000,Date.parse(quote.periodEnd));
      db.prepare("UPDATE plan_upgrade_quotes SET state='expired' WHERE tenant_id=? AND state='quoted'").run(s.tenant_id);
      db.prepare('INSERT INTO plan_upgrade_quotes(id,tenant_id,subscription_revision,target_plan,cycle,period_end,due_cents,quote_json,expires_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)').run(id,s.tenant_id,subscription.revision,quote.to,quote.cycle,quote.periodEnd,quote.dueCents,JSON.stringify(quote),expiresAt,new Date(now).toISOString());
      json(res,200,{id,expiresAt,...quote});return true;
    }
    if (url.pathname==='/api/billing/upgrade/request' && req.method==='POST') {
      const row=db.prepare('SELECT * FROM plan_upgrade_quotes WHERE id=? AND tenant_id=?').get(String(body.quoteId||''),s.tenant_id);
      if (!row || row.expires_at<=now || row.state==='expired' || !subscription || subscription.state!=='active' || subscription.revision!==row.subscription_revision || subscription.period_end!==row.period_end || Date.parse(subscription.period_end)<=now) throw new ApiError(409,'Il preventivo è scaduto o l’abbonamento è cambiato. Ricalcola l’upgrade.');
      if (row.state==='paid') throw new ApiError(409,'Questo upgrade risulta già pagato.');
      db.prepare("UPDATE plan_upgrade_quotes SET state='requested' WHERE id=? AND state='quoted'").run(row.id);
      // Only a merchant-issued checkout bound to this exact persisted quote is accepted.
      // An ordinary full-price subscription link must never replace a prorated payment.
      const configured=env['PRIME_SUBY_UPGRADE_'+row.id.replaceAll('-','_').toUpperCase()+'_URL'];
      let paymentUrl=null;try{const u=new URL(configured);if(u.protocol==='https:'&&!u.username&&!u.password)paymentUrl=u.href;}catch{}
      json(res,200,{requested:true,quoteId:row.id,dueCents:row.due_cents,paymentUrl,message:paymentUrl?'Completa il pagamento per attivare l’upgrade.':'Richiesta registrata. L’assistenza predisporrà il pagamento dell’importo proporzionale; il piano attuale resta attivo. Nessun addebito effettuato.'});return true;
    }
    throw new ApiError(404,'Operazione upgrade non disponibile.');
  };
}
