import { wireStripeChart } from './stripe-chart.js?v=20261104-connected-account';
import { financeIcon } from './finance-icons.js?v=20261101-relief-icons';

const money = (value,currency='eur') => {
 const formatter=new Intl.NumberFormat(document.documentElement.lang==='en'?'en-GB':'it-IT',{style:'currency',currency:currency.toUpperCase()});
 const digits=['isk','ugx'].includes(currency)?2:formatter.resolvedOptions().maximumFractionDigits;
 return formatter.format((value||0)/10**digits);
};
const eur = value => money(value);
const shareLink = url => 'mailto:?subject='+encodeURIComponent('Richiesta di pagamento')+'&body='+encodeURIComponent('Puoi completare il pagamento qui: '+url);
const chartText = (it,en) => document.documentElement.lang==='en' ? en : it;
const labels = {pending:'In attesa',paid:'Pagato',expired:'Scaduto',canceled:'Annullato',refunded:'Rimborsato',partially_refunded:'Rimborso parziale',creating:'In preparazione',open:'Da pagare',draft:'Bozza',paid:'Pagata',void:'Annullata',uncollectible:'Non esigibile'};
const idempotencyKey = () => crypto.randomUUID();

export function simulateStripeDemoPayout(ledger, amount) {
 const cents=Math.round(Number(amount)*100);
 if(!Number.isFinite(Number(amount))||!Number.isSafeInteger(cents)||cents<100||cents>ledger.available)throw Error('Inserisci un importo valido entro il saldo disponibile.');
 ledger.available-=cents;const payout={amount:cents};ledger.payouts.unshift(payout);return payout;
}
export async function renderStripeAgency({main,state,api,esc,pageHeader,toast}) {
  if(state.me.customer_demo&&state.me.stripe_demo_simulation===true){
    const dark=state.me.theme==='dark';
    const ledger=state.stripeDemoLedger??= {available:124000,pending:38000,payouts:[]};
    const cards=state.stripeDemoCards??=[{id:'demo-stripe-card-1',name:'Carta operativa',last4:'4242',status:'active',limit:2500,type:'Virtuale'},{id:'demo-stripe-card-2',name:'Carta trasferte',last4:'1881',status:'inactive',limit:900,type:'Virtuale'}];
    const demoSeries=[[38,16,28],[54,22,41],[46,18,35],[70,27,55],[62,24,49],[86,31,63],[58,23,45],[76,29,60],[68,26,51],[90,34,70],[73,28,57],[96,37,74]].map((v,i)=>({month:String(i+1).padStart(2,'0'),income:v[0]*1000,pending:v[2]*1000,cost:v[1]*1000}));
    main.innerHTML=pageHeader('INCASSI E PAGAMENTI','Stripe · anteprima','Esempio dimostrativo della funzione disponibile nei piani Elite e Secret.')+
      `<section class="stripe-intro panel"><img src="/brands/stripe-wordmark-${dark?'white':'slate'}.svg" alt="Stripe" width="112" height="48"><p>Anteprima con dati fittizi. Nessuna chiave viene salvata e nessun pagamento reale viene creato.</p><span class="stripe-demo-badge">DATI DIMOSTRATIVI</span></section>`+
      `<section class="panel stripe-chart-panel"><p class="eyebrow">${chartText('ANDAMENTO · ULTIMI 12 MESI','PERFORMANCE · LAST 12 MONTHS')}</p><h2>${chartText('Entrate, in attesa e uscite','Income, pending and expenses')}</h2><div class="stripe-chart-legend"><span class="income-key">${chartText('Entrate','Income')}</span><span class="pending-key">${chartText('In attesa','Pending')}</span><span class="cost-key">${chartText('Uscite','Expenses')}</span></div><div class="stripe-chart stripe-demo-chart" aria-label="${chartText('Grafico dimostrativo Stripe','Stripe demo chart')}"></div><p class="small-note">${chartText('Dati dimostrativi: entrate in verde, importi in attesa in arancione e uscite in rosso.','Sample data: income in green, pending amounts in amber and expenses in red.')}</p></section>`+
      `<section class="stripe-grid"><article class="panel stripe-overview"><p class="eyebrow">RIEPILOGO</p><h2>Saldo Stripe e accrediti</h2><div class="stripe-balances"><div><small>Disponibile</small><strong data-demo-available>${eur(ledger.available)}</strong></div><div><small>In sospeso</small><strong class="stripe-demo-pending">${eur(ledger.pending)}</strong></div></div><h3>Ultimi accrediti al conto collegato</h3><ul class="stripe-payouts"><li><span>€ 750,00</span><span>Accreditato</span></li><li><span>€ 490,00</span><span>In transito</span></li></ul></article><article class="panel stripe-overview"><p class="eyebrow">PAGAMENTI</p><h2>Attività recente</h2><div class="stripe-demo-payments"><p><span>Provvigione · Via Roma 10</span><strong class="stripe-demo-income">€ 850,00 · Pagato</strong></p><p><span>Consulenza immobiliare</span><strong class="stripe-demo-pending">€ 250,00 · In attesa</strong></p><p><span>Servizio di valutazione</span><strong class="stripe-demo-expense">€ 120,00 · Rimborsato</strong></p></div></article></section>`+
      `<section class="panel stripe-issuing" data-demo-issuing><p class="eyebrow">CARTE AZIENDALI · DEMO</p><h2>Gestisci le carte Stripe</h2><p>Carte virtuali di esempio, limiti mensili e stato operativo. I dati sono fittizi e non generano carte reali.</p><div class="stripe-cards" data-demo-cards></div><form class="stripe-card-form" data-demo-card-form><label>Nome carta<input name="name" maxlength="24" required placeholder="Carta collaboratore"></label><label>Limite mensile (€)<input name="limit" type="number" min="100" max="10000" step="50" required value="1000"></label><button class="primary" type="submit">Crea carta virtuale</button><p class="stripe-feedback" role="status"></p></form></section>`;
    const drawCards=()=>{const host=main.querySelector('[data-demo-cards]');if(!host)return;host.innerHTML=cards.map(card=>`<div class="stripe-card-row"><span>${financeIcon('payments')} <strong>${esc(card.name)}</strong> · •••• ${esc(card.last4)}</span><span class="stripe-card-status ${card.status==='active'?'stripe-demo-income':'stripe-demo-pending'}">${card.status==='active'?'Attiva':'Inattiva'} · ${eur(card.limit*100)}/mese</span><button type="button" class="text-button" data-demo-card-toggle="${esc(card.id)}">${card.status==='active'?'Blocca':'Attiva'}</button></div>`).join('');host.querySelectorAll('[data-demo-card-toggle]').forEach(button=>button.onclick=()=>{const card=cards.find(item=>item.id===button.dataset.demoCardToggle);if(!card)return;card.status=card.status==='active'?'inactive':'active';drawCards();});};
    drawCards();
    const cardForm=main.querySelector('[data-demo-card-form]');cardForm.onsubmit=event=>{event.preventDefault();if(!cardForm.reportValidity())return;const body=Object.fromEntries(new FormData(cardForm)),name=String(body.name||'').trim(),limit=Number(body.limit);if(!name||!Number.isFinite(limit)||limit<100||limit>10000){cardForm.querySelector('[role=status]').textContent='Inserisci un nome e un limite mensile validi.';return;}cards.unshift({id:crypto.randomUUID(),name,last4:String(Math.floor(1000+Math.random()*9000)),status:'inactive',limit,type:'Virtuale'});drawCards();cardForm.reset();cardForm.querySelector('[role=status]').textContent='Carta virtuale simulata creata come inattiva.';};
    if(state.me.demo_plan==='secret'){
      const live=document.createElement('button');
      live.type='button';live.className='secondary';live.textContent='Stripe Live';
      live.onclick=()=>{state.me.stripe_demo_simulation=false;return renderStripeAgency({main,state,api,esc,pageHeader,toast});};
      main.querySelector('.stripe-intro').append(live);
    }
    const payout=document.createElement('section');payout.className='panel stripe-payout-create';
    payout.innerHTML='<p class="eyebrow">ACCREDITO BANCARIO · DEMO</p><h2>Trasferisci al tuo conto collegato</h2><p>Simulazione di accredito dal saldo Stripe al conto bancario collegato.</p><form class="stripe-payout-form"><label>Importo (€)<input name="amount" type="number" min="1" max="1240" step="0.01" required></label><label class="stripe-confirm"><input name="confirmed" type="checkbox" required>Confermo la simulazione</label><button class="primary">Simula accredito</button><p class="stripe-feedback" role="status"></p></form>';
    main.querySelector('.stripe-issuing').before(payout);
    const form=payout.querySelector('form'),amountInput=form.elements.namedItem('amount');
    const updateSummary=()=>{
      main.querySelector('[data-demo-available]').textContent=eur(ledger.available);
      amountInput.max=String(ledger.available/100);form.querySelector('button').disabled=ledger.available<100;
      main.querySelectorAll('[data-demo-payout-row]').forEach(row=>row.remove());
      const list=main.querySelector('.stripe-payouts'),activity=main.querySelector('.stripe-demo-payments');
      for(const item of [...ledger.payouts].reverse()){
        const row=document.createElement('li');row.dataset.demoPayoutRow='true';
        row.innerHTML='<span>'+eur(item.amount)+'</span><span>In transito · simulato</span>';list.prepend(row);
        const recent=document.createElement('p');recent.dataset.demoPayoutRow='true';
        recent.innerHTML='<span>Accredito al conto collegato · simulato</span><strong class="stripe-demo-pending">'+eur(item.amount)+' · In transito</strong>';activity.prepend(recent);
      }
    };
    updateSummary();
    form.onsubmit=event=>{
      event.preventDefault();if(!form.reportValidity())return;
      try{const item=simulateStripeDemoPayout(ledger,amountInput.value);updateSummary();form.reset();payout.querySelector('.stripe-feedback').textContent='Accredito simulato di '+eur(item.amount)+'. Saldo e riepilogo aggiornati.';}
      catch(error){payout.querySelector('.stripe-feedback').textContent=error.message;}
    };
    wireStripeChart(main.querySelector('.stripe-chart-panel'),demoSeries);
    return;
  }
  const demo=state.me.customer_demo===true;
  const canLive=demo?state.me.demo_plan==='secret':state.me.plan==='secret'||state.me.edition==='secret';
  let mode=state.stripeMode==='test'?'test':canLive?'live':'test';
  let status,overview,report,invoices,issuing,links,chartCurrency;
  let refreshVersion=0;
  const request=(path,method='GET',body)=>api(`/api/stripe${path}${path.includes('?')?'&':'?'}mode=${mode}`,{method,...(body?{body:JSON.stringify(body)}:{})});
  const refresh=async()=>{
    const attempt=++refreshVersion;
    const connected=await request('/status');
    const read=path=>request(path).catch(error=>({error:error.message}));
    const values=connected.configured?await Promise.all(['/overview','/reports','/invoices','/issuing','/payment-links'].map(read)):[null,null,null,null,null];
    if(attempt!==refreshVersion||!main.isConnected)return;
    status=connected;
    [overview,report,invoices,issuing,links]=values;
    const currencies=Object.keys(report?.seriesByCurrency||{});
    if(!currencies.includes(chartCurrency))chartCurrency=currencies.includes('eur')?'eur':currencies[0]||'eur';
    draw();
  };
  const draw=()=>{
    const dark=state.me.theme==='dark',isOwner=state.me.role==='owner'&&!demo;
    const series=report?.seriesByCurrency?.[chartCurrency]||[];
    const currencies=Object.keys(report?.seriesByCurrency||{});
    const dashboard=status?.configured?'https://dashboard.stripe.com/'+encodeURIComponent(status.accountId)+(mode==='test'?'/test':''):'';
    const invoicesList=Array.isArray(invoices)?invoices:[];
    const stateError=(data,empty)=>data?.error?'<p class="stripe-feedback" role="status">'+esc(data.error)+'</p>':empty;
    const recentPayments=overview?.payments?.length?`<div class="stripe-table-wrap"><table class="stripe-table"><thead><tr><th>Descrizione</th><th>Importo</th><th>Stato</th><th>Data</th><th>Azioni</th></tr></thead><tbody>${overview.payments.map(p=>`<tr><td>${esc(p.description)}</td><td>${money(p.amount,p.currency)}</td><td><span class="stripe-status stripe-status-${['pending','paid','refunded','partially_refunded','canceled','expired','open'].includes(p.state)?p.state:'other'}">${labels[p.state]||esc(p.state)}</span>${p.refunded?` · ${money(p.refunded,p.currency)}`:''}</td><td>${esc(new Date(p.createdAt).toLocaleString((document.documentElement.lang==='en'?'en-GB':'it-IT')))}</td><td class="stripe-row-actions">${p.checkoutUrl?`<a class="text-button" href="${esc(p.checkoutUrl)}" target="_blank" rel="noopener noreferrer">Apri</a>`:''}${isOwner?`<button class="text-button" data-sync="${esc(p.id)}">Aggiorna</button>${['paid','partially_refunded'].includes(p.state)?`<button class="text-button" data-refund="${esc(p.id)}" data-request-key="${idempotencyKey()}">Rimborsa</button>`:''}`:''}</td></tr>`).join('')}</tbody></table></div>`:'<p class="small-note">I pagamenti appariranno qui.</p>';
    const invoiceRows=invoicesList.length?`<div class="stripe-table-wrap"><table class="stripe-table"><thead><tr><th>Numero</th><th>Cliente</th><th>Importo</th><th>Stato</th><th>Apri</th></tr></thead><tbody>${invoicesList.map(i=>`<tr><td>${esc(i.number)}</td><td>${esc(i.customer)}</td><td>${money(i.amount,i.currency)}</td><td>${labels[i.status]||esc(i.status)}</td><td>${i.url?`<a class="text-button" href="${esc(i.url)}" target="_blank" rel="noopener noreferrer">Link</a>`:'—'} ${i.pdf?`<a class="text-button" href="${esc(i.pdf)}" target="_blank" rel="noopener noreferrer">PDF</a>`:''}${isOwner&&['draft','open'].includes(i.status)?` <button type="button" class="text-button" data-invoice-action="send" data-id="${esc(i.id)}">${i.status==='draft'?'Invia':'Reinvia'}</button>`:''}${isOwner&&['open','uncollectible'].includes(i.status)?` <button type="button" class="text-button" data-invoice-action="void" data-id="${esc(i.id)}">Annulla</button>`:''}</td></tr>`).join('')}</tbody></table></div>`:stateError(invoices,'<p class="small-note">Nessuna fattura disponibile.</p>');
    const chart=series.length?`<div class="stripe-chart-legend"><span class="income-key">${chartText('Entrate','Income')}</span><span class="pending-key">${chartText('In attesa','Pending')}</span><span class="cost-key">${chartText('Uscite · commissioni e rimborsi','Expenses · fees and refunds')}</span></div><div class="stripe-chart" aria-label="${chartText('Andamento mensile Stripe','Monthly Stripe activity')}"></div><p class="small-note">${chartText('Nel grafico: incassi, pagamenti ancora in attesa e costi per commissioni e rimborsi. PRIME non legge i movimenti del conto bancario esterno.','Chart shows income, payments still pending, and fees and refunds. PRIME does not read transactions from the external bank account.')} ${report.reportCapped?chartText('Report limitato alle 2.000 transazioni più recenti.','Report limited to the 2,000 most recent transactions.'):''}</p><div class="stripe-table-wrap"><table class="stripe-table"><thead><tr><th>Mese</th><th>Incassi lordi</th><th>Commissioni</th><th>Rimborsi</th><th>Bonifici</th><th>Netto saldo</th></tr></thead><tbody>${series.map(x=>`<tr><td>${esc(x.month)}</td><td>${money(x.income,chartCurrency)}</td><td>${money(x.fees,chartCurrency)}</td><td>${money(x.refunds,chartCurrency)}</td><td>${money(x.payouts,chartCurrency)}</td><td>${money(x.net,chartCurrency)}</td></tr>`).join('')}</tbody></table></div>`:stateError(report,status?.configured?'<p class="small-note">Nessun movimento disponibile per il periodo selezionato.</p>':'<p class="small-note">Collega Stripe per caricare il report.</p>');
    const receivables=invoicesList.some(i=>i.status==='open')?`<ul class="stripe-payouts">${invoicesList.filter(i=>i.status==='open').map(i=>`<li><span>${esc(i.customer)} · ${esc(i.number)}</span><span>${money(i.remaining,i.currency)} · scadenza ${i.due?esc(new Date(i.due*1000).toLocaleDateString((document.documentElement.lang==='en'?'en-GB':'it-IT'))):'—'} ${i.url?`<a href="${esc(i.url)}" target="_blank" rel="noopener noreferrer">Apri</a>`:''}</span></li>`).join('')}</ul>`:'<p class="small-note">Nessuna fattura aperta.</p>';
    main.innerHTML=pageHeader('INCASSI E PAGAMENTI','Stripe','Incassi, fatture, saldo Stripe, accrediti sul conto collegato e report finanziari. Disponibile nei piani Elite e Secret.')+
      `<section class="stripe-intro panel"><img src="/brands/stripe-wordmark-${dark?'white':'slate'}.svg" alt="Stripe" width="112" height="48"><p>Le transazioni sono elaborate da Stripe. I dati delle carte restano nelle pagine sicure Stripe. PRIME mostra il saldo e i movimenti registrati da Stripe; non legge le spese del tuo conto bancario.</p><div class="stripe-mode-switch" role="group" aria-label="Ambiente Stripe"><button type="button" data-mode="test" class="${mode==='test'?'active':''}">Test</button><button type="button" data-mode="live" class="${mode==='live'?'active':''}" ${canLive?'':'disabled title="Disponibile solo nel piano Secret"'}>Produzione${canLive?'':' · Secret'}</button></div></section>`+
      `<section class="panel stripe-chart-panel"><p class="eyebrow">${chartText('ANDAMENTO · ULTIMI 12 MESI','PERFORMANCE · LAST 12 MONTHS')}</p><h2>${chartText('Entrate, in attesa e uscite','Income, pending and expenses')}</h2>${chart}</section>`+
      `<section class="stripe-grid"><article class="panel stripe-setup"><p class="eyebrow">STRIPE CONNECT</p><h2>Collega Stripe alla tua agenzia</h2><p>Autorizza un account Stripe Connect intestato alla tua agenzia. Incassi, fatture e pagamenti vengono elaborati direttamente sul tuo account; PRIME non riceve i dati completi delle carte.</p><p class="small-note">La verifica dell’agenzia e l’inserimento del conto bancario avvengono nel flusso protetto di Stripe. Per le agenzie italiane, i bonifici sono accrediti dal saldo Stripe al conto associato. Financial Connections è disponibile solo per conti bancari statunitensi e richiede l’abilitazione Stripe.</p>${state.me.role==='owner'?'<button type="button" class="primary" data-connect>'+(status?.configured?'Continua o aggiorna la verifica Stripe':'Collega il conto Stripe')+'</button><p class="stripe-feedback" role="status" aria-live="polite"></p>':'<p class="small-note">Solo il titolare può collegare Stripe Connect.</p>'}${status?.webhookUrl?'<div class="stripe-endpoint"><strong>Webhook Connect</strong><code>'+esc(status.webhookUrl)+'</code><button type="button" data-copy="'+esc(status.webhookUrl)+'" class="text-button">Copia endpoint</button></div>':''}</article><article class="panel stripe-overview"><p class="eyebrow">RIEPILOGO ${mode==='test'?'TEST':'PRODUZIONE'}</p><h2>Saldo Stripe e accrediti</h2>${overview?.error?`<p class="stripe-feedback">${esc(overview.error)}</p>`:overview?`<div class="stripe-balances"><div><small>Disponibile su Stripe</small><strong>${overview.available.map(x=>money(x.amount,x.currency)).join('<br>')||eur(0)}</strong></div><div><small>In sospeso su Stripe</small><strong>${overview.pending.map(x=>money(x.amount,x.currency)).join('<br>')||eur(0)}</strong></div></div><p class="small-note">Incassi: ${overview.chargesEnabled?'attivi':'non attivi'} · Accrediti: ${overview.payoutsEnabled?'attivi':'non attivi'} · Frequenza: ${esc(overview.payoutSchedule)}</p><h3>Ultimi accrediti al conto bancario collegato</h3>${overview.payouts.length?`<ul class="stripe-payouts">${overview.payouts.map(x=>`<li><span>${money(x.amount,x.currency)}</span><span>${esc(x.status)}${x.arrival?' · '+esc(new Date(x.arrival*1000).toLocaleDateString((document.documentElement.lang==='en'?'en-GB':'it-IT'))):''}</span></li>`).join('')}</ul>`:'<p class="small-note">Nessun accredito recente.</p>'}`:'<p class="small-note">Collega Stripe per consultare il saldo.</p>'}</article></section>`+
      `<section class="stripe-grid stripe-finance-grid"><article class="panel stripe-payout-create"><p class="eyebrow">ACCREDITO BANCARIO</p><h2>Trasferisci al tuo conto collegato</h2><p>L’accredito trasferisce fondi disponibili dal saldo Stripe al conto bancario collegato. Non invia bonifici a destinatari bancari arbitrari.</p>${isOwner&&overview?.payoutSchedule==='manual'?`<form class="stripe-payout-form"><input type="hidden" name="requestKey" value="${idempotencyKey()}"><label>Importo (€)<input name="amount" type="number" min="1" step="0.01" required></label><label class="stripe-confirm"><input name="confirmed" type="checkbox" required>Confermo il trasferimento</label><button class="primary">Invia al conto collegato</button><p class="stripe-feedback" role="status"></p></form>`:overview?.payoutSchedule!=='manual'?'<p class="small-note">Per richiedere manualmente un accredito imposta la frequenza su “manuale” nel Dashboard Stripe. In alternativa gestisci il calendario automatico da Stripe.</p>':'<p class="small-note">Solo il titolare può richiedere payout.</p>'}<h3>Importi da incassare</h3>${receivables}</article></section>`+
      `<section class="panel stripe-collection stripe-invoices"><p class="eyebrow">FATTURAZIONE STRIPE</p><h2>Crea e invia una fattura</h2><p>Stripe invia al cliente la fattura commerciale e il relativo link di pagamento. Per la fattura elettronica italiana tramite SDI serve un servizio compatibile.</p>${isOwner?`<form class="stripe-invoice-form"><input type="hidden" name="requestKey" value="${idempotencyKey()}"><label>Cliente<input name="name" required maxlength="120"></label><label>Email cliente<input name="email" type="email" required maxlength="254"></label><label>Descrizione<input name="description" required maxlength="200"></label><label>Importo (€)<input name="amount" type="number" min="0.50" max="999999.99" step="0.01" required></label><label>Scadenza<select name="daysUntilDue"><option value="7">7 giorni</option><option value="14">14 giorni</option><option value="30" selected>30 giorni</option><option value="60">60 giorni</option></select></label><button class="secondary" type="submit" name="action" value="draft" ${!status?.configured?'disabled':''}>Salva bozza</button><button class="primary" type="submit" name="action" value="send" ${!status?.configured?'disabled':''}>Crea e invia fattura</button><p class="stripe-feedback" role="status" aria-live="polite"></p></form>`:'<p class="small-note">Solo il titolare può creare e inviare fatture.</p>'}<h3>Fatture recenti</h3>${invoiceRows}</section>`+
      `<section class="panel stripe-collection"><p class="eyebrow">RICHIESTE DI PAGAMENTO</p><h2>Crea un link di pagamento</h2><p>Crea un link Stripe da condividere via email o da copiare. Saldi, incassi e stato dei link si aggiornano leggendo Stripe.</p>${isOwner?`<form class="stripe-checkout"><input type="hidden" name="requestKey" value="${idempotencyKey()}"><label>Descrizione<input name="description" required maxlength="200" placeholder="es. Provvigione · Via Roma 10"></label><label>Importo (€)<input name="amount" type="number" min="0.50" max="999999.99" step="0.01" required></label><button class="primary" type="submit" ${!status?.configured?'disabled':''}>Crea link Stripe</button><p class="stripe-feedback" role="status" aria-live="polite"></p></form>`:'<p class="small-note">Solo il titolare può creare richieste e gestire rimborsi.</p>'}<h3>Link di pagamento Stripe</h3><div data-stripe-links></div><h3>Richieste Checkout create in PRIME</h3>${recentPayments}</section>`+
      `<section class="panel stripe-issuing"><p class="eyebrow">CARTE AZIENDALI</p><h2>Gestisci le carte Stripe</h2>${issuing?.enabled?`<p>Carte collegate a Stripe Issuing, con stato e ultime quattro cifre. La creazione e la gestione restano soggette all’idoneità del conto Stripe.</p><div class="stripe-cards">${(issuing.cards||[]).map(card=>`<div class="stripe-card-row"><span>${financeIcon('payments')} <strong>•••• ${esc(card.last4||'—')}</strong> · ${esc(card.name||'Carta aziendale')}</span><span class="${card.status==='active'?'stripe-demo-income':'stripe-demo-pending'}">${esc(card.type||'Virtuale')} · ${esc(card.status||'—')}</span>${isOwner?`<button type="button" class="text-button" data-card-status="${esc(card.id)}" data-next-status="${card.status==='active'?'inactive':'active'}">${card.status==='active'?'Blocca':'Attiva'}</button>`:''}</div>`).join('')}</div>`:`<p>${esc(issuing?.error||issuing?.reason||'Stripe Issuing richiede l’attivazione e l’approvazione della funzione sul conto collegato.')}</p>`}</section>`;
    const setup=main.querySelector('.stripe-setup'),title=setup?.querySelector('h2');
    const connectButton=setup?.querySelector('[data-connect]');
    if(title){
      title.textContent=status?.configured?'Account Stripe collegato':'Collega il tuo account Stripe esistente';
      title.nextElementSibling.textContent=status?.configured?'Account '+status.accountId+' · '+(mode==='live'?'Produzione':'Test'):'Dopo l’autorizzazione su Stripe, PRIME apre il riepilogo dell’account.';
      title.nextElementSibling.nextElementSibling.textContent=demo?'Questa anteprima mostra i dati reali dell’account collegato. Per operare, collega il conto al tuo workspace PRIME.':'Puoi gestire qui incassi e fatture. Apri il Dashboard Stripe per verifiche, impostazioni e funzioni avanzate.';
    }
    if(connectButton){
      if(status?.configured)connectButton.remove();
      else{connectButton.textContent='Collega account Stripe esistente';connectButton.disabled=!status?.platformConfigured;}
    }
    if(dashboard){
      const link=document.createElement('a');link.href=dashboard;link.target='_blank';link.rel='noopener noreferrer';link.className='secondary';link.textContent='Apri Dashboard Stripe';setup?.append(link);
      const reload=document.createElement('button');reload.type='button';reload.className='secondary';reload.textContent='Aggiorna dati Stripe';reload.onclick=()=>refresh().catch(error=>toast(error.message));setup?.append(reload);
    }
    if(demo){
      main.querySelector('.stripe-invoices h2').textContent='Fatture Stripe';
      main.querySelector('.stripe-checkout')?.remove();
      const workspace=document.createElement('a');workspace.href='/app?stripe_connect=manage&stripe_mode=live';workspace.className='secondary';workspace.textContent='Apri il gestionale per operare';setup?.append(workspace);
    }
    const linkList=main.querySelector('[data-stripe-links]');
    if(Array.isArray(links)&&links.length){
      linkList.innerHTML='<ul class="stripe-payouts">'+links.map(link=>`<li><span>${esc(link.description||'Link Stripe')} ${link.amount===null?'':' · '+money(link.amount,link.currency)}</span><span>${link.active?'Attivo':'Disattivato'} · <a href="${esc(link.url)}" target="_blank" rel="noopener noreferrer">Apri</a> <button type="button" class="text-button" data-copy="${esc(link.url)}">Copia</button> <a href="${esc(shareLink(link.url))}">Email</a> ${isOwner?`<button type="button" class="text-button" data-link-id="${esc(link.id)}" data-link-active="${!link.active}">${link.active?'Disattiva':'Riattiva'}</button>`:''}</span></li>`).join('')+'</ul>';
    }else linkList.innerHTML=stateError(links,'<p class="small-note">Nessun link di pagamento.</p>');
    if(report?.transactions?.length){
      const movements=document.createElement('section');movements.className='panel stripe-collection';
      movements.innerHTML='<p class="eyebrow">MOVIMENTI STRIPE</p><h2>Attività recente dell’account</h2><div class="stripe-table-wrap"><table class="stripe-table"><thead><tr><th>Data</th><th>Movimento</th><th>Importo</th><th>Netto</th><th>Stato</th></tr></thead><tbody>'+report.transactions.slice(0,20).map(tx=>`<tr><td>${esc(new Date(tx.created*1000).toLocaleDateString('it-IT'))}</td><td>${esc(tx.description||tx.category)}</td><td>${money(tx.amount,tx.currency)}</td><td>${money(tx.net,tx.currency)}</td><td>${esc(tx.status==='available'?'Disponibile':'In attesa')}</td></tr>`).join('')+'</tbody></table></div>';
      main.querySelector('.stripe-chart-panel').after(movements);
    }
    if(currencies.length>1){
      const label=document.createElement('label');label.textContent='Valuta ';
      const select=document.createElement('select');
      for(const currency of currencies)select.add(new Option(currency.toUpperCase(),currency,currency===chartCurrency,currency===chartCurrency));
      select.onchange=()=>{chartCurrency=select.value;draw();};label.append(select);
      main.querySelector('.stripe-chart-panel h2').after(label);
    }
    wireStripeChart(main.querySelector('.stripe-chart-panel'),series,chartCurrency);
    const feedback=el=>el.querySelector('.stripe-feedback');
    main.querySelectorAll('[data-mode]').forEach(button=>button.onclick=async()=>{if(button.dataset.mode==='live'&&!canLive){toast('Stripe Live è disponibile solo nel piano Secret.');return;}mode=button.dataset.mode;state.stripeMode=mode;try{await refresh();}catch(error){toast(error.message);}});
    const connect=main.querySelector('[data-connect]');if(connect)connect.onclick=async()=>{connect.disabled=true;const out=main.querySelector('.stripe-setup .stripe-feedback');out.textContent='Apro il collegamento sicuro di Stripe…';try{const result=await request('/connect','POST',{});location.assign(result.url);}catch(error){connect.disabled=false;out.textContent=error.message;}};
    main.querySelectorAll('[data-copy]').forEach(button=>button.onclick=async()=>{try{await navigator.clipboard.writeText(button.dataset.copy);toast('Link copiato.');}catch{toast('Seleziona e copia l’indirizzo.');}});
    const invoiceForm=main.querySelector('.stripe-invoice-form');
    if(invoiceForm)invoiceForm.onsubmit=async e=>{
      e.preventDefault();const form=e.currentTarget,out=feedback(form),body=Object.fromEntries(new FormData(form));
      body.amount=Math.round(Number(body.amount)*100);body.daysUntilDue=Number(body.daysUntilDue);body.send=e.submitter?.value==='send';
      if(body.send&&!confirm('Inviare la fattura tramite Stripe a '+body.email+'?'))return;
      form.querySelectorAll('button').forEach(button=>button.disabled=true);
      out.textContent=body.send?'Creo e invio la fattura…':'Salvo la bozza…';
      try{await request('/invoices','POST',body);toast(body.send?'Fattura creata e inviata.':'Bozza salvata su Stripe.');await refresh();}
      catch(error){out.textContent=error.message;form.querySelectorAll('button').forEach(button=>button.disabled=false);}
    };
    main.querySelectorAll('[data-invoice-action]').forEach(button=>button.onclick=async()=>{
      const action=button.dataset.invoiceAction;
      if(!confirm(action==='send'?'Inviare la fattura al cliente tramite Stripe?':'Annullare la fattura su Stripe?'))return;
      button.disabled=true;
      try{await request('/invoices/'+button.dataset.id+'/'+action,'POST',{confirmed:true,requestKey:button.dataset.requestKey??=idempotencyKey()});await refresh();}
      catch(error){button.disabled=false;toast(error.message);}
    });
    main.querySelectorAll('[data-link-id]').forEach(button=>button.onclick=async()=>{
      const active=button.dataset.linkActive==='true';
      if(!confirm(active?'Riattivare il link di pagamento?':'Disattivare il link di pagamento?'))return;
      button.disabled=true;
      try{await request('/payment-links/'+button.dataset.linkId,'PUT',{active,confirmed:true,requestKey:button.dataset.requestKey??=idempotencyKey()});await refresh();}
      catch(error){button.disabled=false;toast(error.message);}
    });
    const payoutForm=main.querySelector('.stripe-payout-form');if(payoutForm)payoutForm.onsubmit=async e=>{e.preventDefault();const form=e.currentTarget,out=feedback(form),amount=Math.round(Number(form.elements.amount.value)*100);out.textContent='Invio il payout a Stripe…';try{await request('/payouts','POST',{amount,confirmed:form.elements.confirmed.checked,requestKey:form.elements.requestKey.value});toast('Payout richiesto al conto collegato.');await refresh();}catch(error){out.textContent=error.message;}};
    const checkout=main.querySelector('.stripe-checkout');if(checkout)checkout.onsubmit=async e=>{e.preventDefault();const form=e.currentTarget,out=feedback(form),amount=Math.round(Number(form.elements.amount.value)*100);const button=form.querySelector('button');button.disabled=true;out.textContent='Creo il link di pagamento Stripe…';try{const payment=await request('/payment-links','POST',{description:form.elements.description.value,amount,requestKey:form.elements.requestKey.value});let copied=false;try{await navigator.clipboard.writeText(payment.url);copied=true;}catch{}toast(copied?'Link creato e copiato.':'Link creato; lo trovi nell’elenco.');await refresh();}catch(error){out.textContent=error.message;button.disabled=false;}};
    main.querySelectorAll('[data-sync]').forEach(button=>button.onclick=async()=>{button.disabled=true;try{await request(`/payments/${button.dataset.sync}/sync`,'POST',{});await refresh();toast('Stato aggiornato.');}catch(error){button.disabled=false;toast(error.message);}});
    main.querySelectorAll('[data-refund]').forEach(button=>button.onclick=async()=>{if(!confirm('Confermi il rimborso totale?'))return;button.disabled=true;try{await request(`/payments/${button.dataset.refund}/refund`,'POST',{confirmed:true,requestKey:button.dataset.requestKey});await refresh();toast('Rimborso richiesto a Stripe.');}catch(error){button.disabled=false;toast(error.message);}});
    if(isOwner&&issuing?.enabled){
      const controls=document.createElement('div');
      controls.innerHTML=`<h3>Crea una carta virtuale</h3>${issuing.holders.length?`<form class="stripe-card-form" data-card-create><label>Titolare verificato<select name="cardholder" required>${issuing.holders.map(holder=>`<option value="${esc(holder.id)}">${esc(holder.name)}</option>`).join('')}</select></label><label>Limite mensile (€)<input name="monthlyLimit" type="number" min="1" max="100000" step="0.01" required></label><label class="stripe-confirm"><input name="confirmed" type="checkbox" required>Confermo la creazione della carta</label><button class="primary">Crea carta virtuale</button><p class="stripe-feedback" role="status"></p></form>`:'<p>Nessun titolare verificato. Completa prima la verifica in Stripe.</p>'}<p><a href="${esc(dashboard)}" target="_blank" rel="noopener noreferrer">Gestisci i titolari nel Dashboard Stripe</a></p>`;
      main.querySelector('.stripe-issuing').append(controls);
      const form=controls.querySelector('form');
      if(form)form.onsubmit=async event=>{
        event.preventDefault();const button=form.querySelector('button'),out=form.querySelector('[role=status]');
        const data=Object.fromEntries(new FormData(form));button.disabled=true;
        try{await request('/issuing/cards','POST',{cardholder:data.cardholder,monthlyLimit:Math.round(Number(data.monthlyLimit)*100),confirmed:form.elements.confirmed.checked,requestKey:form.dataset.requestKey??=idempotencyKey()});toast('Carta virtuale creata come inattiva.');await refresh();}
        catch(error){button.disabled=false;out.textContent=error.message;}
      };
    }
    main.querySelectorAll('[data-card-status]').forEach(button=>button.onclick=async()=>{button.disabled=true;try{await request(`/issuing/cards/${button.dataset.cardStatus}`,'PUT',{status:button.dataset.nextStatus,confirmed:true});toast('Stato carta aggiornato.');await refresh();}catch(error){button.disabled=false;toast(error.message);}});
  };
  try {
    await refresh();
    const query=new URLSearchParams(location.search),paymentId=query.get('stripe_payment'),result=query.get('result');
    if(paymentId&&/^[a-f0-9-]{36}$/i.test(paymentId)&&status?.configured){
      if(result==='success'){try{await request(`/payments/${paymentId}/sync`,'POST',{});await refresh();}catch{}toast('Checkout completato.');}
      else if(result==='cancelled')toast('Pagamento non completato. Puoi riaprire il link dalla scheda.');
      query.delete('stripe_payment');query.delete('result');history.replaceState(null,'',`${location.pathname}${query.size?'?'+query.toString():''}${location.hash}`);
    }
  } catch(error) { main.innerHTML=pageHeader('INCASSI E PAGAMENTI','Stripe',error.message); }
}
