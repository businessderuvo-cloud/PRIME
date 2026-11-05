import Stripe from 'stripe';
const id=o=>typeof o==='string'?o:o?.id;
export function rewardFulfillment({db,env=process.env,clock=Date.now,clientFactory=key=>new Stripe(key,{apiVersion:'2026-09-30.endive',maxNetworkRetries:2,timeout:15000})}){
 const locks=new Set();let polling=false;
 const finish=(row,ref)=>db.prepare("UPDATE trustpilot_rewards SET status='fulfilled',automation_state='succeeded',fulfillment_reference=?,fulfilled_at=?,automation_error=NULL WHERE tenant_id=? AND status='approved' AND automation_state IN ('pending','processing','scheduled')").run(ref,new Date(clock()).toISOString(),row.tenant_id);
 async function process(tenant){
  if(locks.has(tenant))return;locks.add(tenant);
  try{
   let row=db.prepare("SELECT * FROM trustpilot_rewards WHERE tenant_id=? AND status='approved' AND automation_state IN ('pending','processing','scheduled')").get(tenant);if(!row)return;
   if(!row.payment_reference.startsWith('stripe:')){db.prepare("UPDATE trustpilot_rewards SET automation_error=? WHERE tenant_id=?").run(row.cycle==='monthly'?'Lo sconto CPAY sarà applicato al checkout del secondo mese.':'Rimborso crypto: manca un canale di restituzione verificato.',tenant);return;}
   const key=env.PRIME_STRIPE_LIVE_SECRET_KEY;if(!/^(sk|rk|rkcs)_live_/.test(key||''))throw Error('Stripe live non configurato.');const c=clientFactory(key);
   const subscriptionId=row.payment_reference.slice(7),order=db.prepare('SELECT * FROM stripe_live_checkouts WHERE tenant_id=? AND subscription_id=?').get(tenant,subscriptionId);
   if(!order||order.cycle!==row.cycle)throw Error('Abbonamento Stripe non associato alla richiesta.');
   const sub=await c.subscriptions.retrieve(subscriptionId);if(sub.livemode!==true||!['active','trialing'].includes(sub.status))throw Error('Abbonamento live non attivo.');
   if(row.provider_reference){
    if(row.cycle==='annual'){const refund=await c.refunds.retrieve(row.provider_reference);if(refund.status==='succeeded')finish(row,refund.id);else if(['failed','canceled'].includes(refund.status))throw Error('Rimborso Stripe non riuscito: verifica richiesta.');}
    else{const item=await c.invoiceItems.retrieve(row.provider_reference);if(item.deleted)throw Error('Sconto Stripe rimosso: verifica richiesta.');if(item.invoice){const invoice=await c.invoices.retrieve(id(item.invoice));if(invoice.status==='paid')finish(row,item.id);}}
    return;
   }
   // Retry uncertain network results only within Stripe's idempotency retention window.
   if(row.automation_started_at&&clock()-row.automation_started_at>23*3600000)throw Error('Esito Stripe da riconciliare: retry automatico sospeso per evitare duplicati.');
   const invoices=await c.invoices.list({subscription:subscriptionId,status:'paid',limit:100});
   if(invoices.has_more||invoices.data.some(i=>i.livemode!==true))throw Error('Cronologia fatture da verificare.');
   const initial=invoices.data.find(i=>i.billing_reason==='subscription_create');if(!initial||initial.currency!=='eur'||initial.amount_paid<=0)throw Error('Primo pagamento EUR non confermato.');
   if(row.cycle==='monthly'&&invoices.data.filter(i=>i.billing_reason==='subscription_cycle').length)throw Error('Il secondo mese è già fatturato: verifica richiesta.');
   const amount=row.cycle==='annual'?Math.round(initial.amount_paid/12):Math.round(order.cents*7/100);if(amount<=0)throw Error('Importo premio non valido.');
   db.prepare("UPDATE trustpilot_rewards SET automation_started_at=COALESCE(automation_started_at,?),automation_state='processing',amount_cents=? WHERE tenant_id=? AND status='approved' AND automation_state IN ('pending','processing','scheduled')").run(clock(),amount,tenant);
   const options={idempotencyKey:'prime-review-reward-'+tenant+'-'+row.submitted_at};let result;
   if(row.cycle==='annual'){
    const payments=await c.invoicePayments.list({invoice:initial.id,status:'paid',limit:100});
    const payment=payments.data.find(p=>p.payment?.type==='payment_intent'&&p.amount_paid>=amount);if(!payment||payments.has_more)throw Error('Il pagamento originale non supporta il rimborso automatico disponibile.');
    result=await c.refunds.create({payment_intent:id(payment.payment.payment_intent),amount,metadata:{prime_reward_tenant:tenant,prime_reward_invoice:initial.id}},options);
    if(result.livemode!==true)throw Error('Risposta rimborso non live.');
   }else{
    const drafts=await c.invoices.list({subscription:subscriptionId,status:'draft',limit:100});if(drafts.has_more||drafts.data.length>1)throw Error('Fatture aperte da verificare.');
    result=await c.invoiceItems.create({customer:id(sub.customer),subscription:subscriptionId,...(drafts.data[0]?{invoice:drafts.data[0].id}:{}),currency:'eur',amount:-amount,discountable:false,description:'PRIME · 7% sul secondo mese · premio recensione verificata',metadata:{prime_reward_tenant:tenant}},options);
    if(result.livemode!==true)throw Error('Risposta sconto non live.');
   }
   db.prepare("UPDATE trustpilot_rewards SET provider_reference=?,automation_state='scheduled',automation_error=NULL WHERE tenant_id=? AND status='approved' AND automation_state IN ('pending','processing','scheduled')").run(result.id,tenant);
   if(row.cycle==='annual'&&result.status==='succeeded')finish(row,result.id);
  }catch(error){db.prepare("UPDATE trustpilot_rewards SET automation_error=? WHERE tenant_id=? AND status='approved' AND automation_state IN ('pending','processing','scheduled')").run(error?.type==='StripeInvalidRequestError'?'Stripe richiede una verifica della configurazione del premio.':String(error.message||'Erogazione temporaneamente non disponibile.').slice(0,240),tenant);}
  finally{locks.delete(tenant);}
 }
 async function poll(){if(polling)return;polling=true;try{for(const r of db.prepare("SELECT tenant_id FROM trustpilot_rewards WHERE status='approved' AND automation_state IN ('pending','processing','scheduled') ORDER BY verified_at LIMIT 100").all())await process(r.tenant_id);}finally{polling=false;}}
 return {process,poll};
}
