import {plans} from './pricing.js?v=20261031-annual-prices-v2';

const q=new URLSearchParams(location.search),live=q.get('choose')==='live'||(q.get('live')==='1'&&!q.has('order')),lang=window.primeI18n?.language||'it';
await window.primeI18n?.ready;
const t=s=>window.primeI18n?.t(s)||s;
if(live)await import('./checkout-live-choice.js?v=20261031-payment-icons-v17');
if(!live){
const liveCopy=lang==='en'?{
 header:'LIVE CHECKOUT',eyebrow:'LIVE CHECKOUT',lead:'Choose cards and Klarna or crypto for your PRIME plan.',step:'LIVE',title:'Choose how to pay.',notice:'Live checkout. No payment is taken until you confirm it with the provider.',card:'Cards and Klarna',cardDetail:'Secure Stripe Live checkout',crypto:'Crypto',cryptoDetail:'BTC or USDC through CPAY Live',payCard:'Open Stripe Live checkout ↗',payCrypto:'Continue to crypto checkout ↗',working:'Preparing the live checkout…',login:'Sign in as the agency owner to continue.',account:'Sign in and continue to checkout',privacy:'Privacy and Terms',back:'← Back to PRIME',monthly:'Monthly',annual:'Annual',payment:'Payment method',manual:'Manual renewal with crypto. Annual crypto checkout includes three extra months.'
}:{
 header:'CHECKOUT LIVE',eyebrow:'CHECKOUT LIVE',lead:'Scegli carte e Klarna oppure crypto per il tuo piano PRIME.',step:'LIVE',title:'Come vuoi pagare?',notice:'Checkout live. Il pagamento avviene solo quando lo confermi sul provider.',card:'Carte e Klarna',cardDetail:'Checkout sicuro Stripe Live',crypto:'Crypto',cryptoDetail:'BTC o USDC tramite CPAY Live',payCard:'Apri il checkout Stripe Live ↗',payCrypto:'Continua al checkout crypto ↗',working:'Preparo il checkout live…',login:'Accedi con il titolare dell’agenzia per continuare.',account:'Accedi e continua al checkout',privacy:'Privacy e Termini',back:'← Torna a PRIME',monthly:'Mensile',annual:'Annuale',payment:'Metodo di pagamento',manual:'Rinnovo manuale con crypto. Il checkout annuale crypto include tre mesi extra.'
};
const copy=live?liveCopy:null;

document.body.innerHTML=`<header><a href="/?lang=${lang}"><img src="/assets/prime-wordmark.svg" width="220" height="37" alt="PRIME"></a><span class="secure">${live?copy.header:'STRIPE · TEST'}</span><label class="language-control"><span>Language</span><select id="test-language"><option value="it">Italiano</option><option value="en">English</option></select></label></header><main><section class="intro"><a class="back" href="/${live?'?account=login&return=checkout':`?lang=${lang}#piani`}">${live?copy.back:t('← Torna a PRIME')}</a><p class="eyebrow">${live?copy.eyebrow:t('CHECKOUT DI TEST')}</p><h1>Il prossimo passo.<br><span>Con PRIME.</span></h1><p class="lead">${live?copy.lead:t('Carte e Klarna tramite Stripe. Nessun addebito reale.')}</p><article class="order"><label>${live?'Piano':t('Piano')}<select id="test-plan">${Object.entries(plans).map(([id,p])=>`<option value="${id}">${p.name}</option>`).join('')}</select></label><label>${t('Fatturazione')}<select id="test-cycle"><option value="monthly">${live?copy.monthly:t('Mensile')}</option><option value="annual">${live?copy.annual:t('Annuale')}</option></select></label><dl><div class="total"><dt>${t('Totale da pagare')}</dt><dd id="test-total"></dd></div></dl><p>${live?copy.manual:t('Gli agenti inclusi sono quelli del piano scelto.')}</p></article></section><section class="payment-panel"><div class="panel-top"><span class="step">${live?copy.step:'TEST'}</span><span class="provider">${live?'PRIME · LIVE':'Stripe'}</span></div><h2>${live?copy.title:t('Prova il pagamento.')}</h2><p class="notice">${live?copy.notice:t('Modalità test: utilizza solo dati di prova Stripe. Il pagamento non attiva o modifica abbonamenti reali.')}</p>${live?`<fieldset class="live-method-selector"><legend>${copy.payment}</legend><div class="coin-options method-options"><button type="button" data-live-method="stripe_live" aria-pressed="true"><span>${copy.card}<small>${copy.cardDetail}</small></span></button><button type="button" data-live-method="crypto" aria-pressed="false"><span>${copy.crypto}<small>${copy.cryptoDetail}</small></span></button></div></fieldset>`:`<p><img src="/brands/klarna-badge.svg" alt="Klarna" width="72" height="30"></p><p>Klarna propone le opzioni idonee per paese, importo e periodicità. Le rate richiedono approvazione Klarna.</p>`}<button class="primary" id="test-pay">${live?copy.payCard:t('Apri Stripe Checkout test ↗')}</button><p class="panel-copy" id="test-message" role="status"></p><p class="support"><a href="${live?'/?account=login&return=checkout':`/?lang=${lang}#inizia`}">${live?copy.account:t('Accedi o registra la tua agenzia')}</a></p>${live?'':`<p class="footnote">${t('È richiesta la verifica aziendale approvata, anche per aprire il checkout dal tuo account. La versione test non usa chiavi live.')}</p>`}</section></main><footer><span>PRIME · Più tempo per ciò che conta davvero.</span><a href="/privacy?lang=${lang}">${live?copy.privacy:t('Privacy e Termini')}</a></footer>`;

const liveMethodIcons={card:'<svg class="coin-symbol" viewBox="0 0 32 32" aria-hidden="true"><rect x="4" y="7" width="24" height="18" rx="3"/><path d="M4 13h24M8 20h6"/></svg>',crypto:'<svg class="coin-symbol" viewBox="0 0 32 32" aria-hidden="true"><path d="M9 8h9a4 4 0 0 1 0 8h-7m0 0h8a4 4 0 0 1 0 8H9M11 8v16M14 5v3m4-3v3M14 24v3m4-3v3"/></svg>'};
if(live){
 const card=document.querySelector('[data-live-method="stripe_live"]'),cryptoMethod=document.querySelector('[data-live-method="crypto"]');
 card.insertAdjacentHTML('afterbegin',liveMethodIcons.card);cryptoMethod.insertAdjacentHTML('afterbegin',liveMethodIcons.crypto);
 for(const option of [card,cryptoMethod])option.insertAdjacentHTML('beforeend','<span class="radio-dot" aria-hidden="true"></span>');
 card.querySelector('small').insertAdjacentHTML('afterend','<img class="method-brand" src="/brands/klarna-badge.svg" alt="Klarna">');
}
const plan=document.querySelector('#test-plan'),cycle=document.querySelector('#test-cycle'),button=document.querySelector('#test-pay'),message=document.querySelector('#test-message');
plan.value=Object.hasOwn(plans,q.get('plan'))?q.get('plan'):'standard';cycle.value=q.get('cycle')==='annual'?'annual':'monthly';
const language=document.querySelector('#test-language');language.value=lang;language.onchange=()=>window.primeI18n.change(language.value);
let liveMethod='stripe_live';
function total(){const p=plans[plan.value],cryptoAnnual=live&&liveMethod==='crypto'&&cycle.value==='annual',amount=cryptoAnnual?p.monthly*9:cycle.value==='annual'?p.annual:p.monthly;document.querySelector('#test-total').textContent=new Intl.NumberFormat(lang==='en'?'en-GB':'it-IT',{style:'currency',currency:'EUR'}).format(amount);if(live)button.textContent=liveMethod==='crypto'?copy.payCrypto:copy.payCard;}
plan.onchange=cycle.onchange=total;
document.querySelectorAll('[data-live-method]').forEach(option=>option.onclick=()=>{liveMethod=option.dataset.liveMethod;document.querySelectorAll('[data-live-method]').forEach(button=>button.setAttribute('aria-pressed',String(button===option)));total();});
total();let requestKey=crypto.randomUUID();
button.onclick=async()=>{
 button.disabled=true;message.textContent=live?copy.working:t('Preparazione checkout Stripe test…');
 try{
  const auth=await fetch('/api/me',{cache:'no-store'});if(!auth.ok)throw Error(live?copy.login:t('Accedi con il titolare dell’agenzia prima di continuare.'));
  const me=await auth.json(),p=plans[plan.value],details={plan:plan.value,cycle:cycle.value,humans:p.humans,ai:p.ai};
  const path=live?(liveMethod==='crypto'?'/api/billing/checkout':'/api/billing/stripe/live/checkout'):'/api/billing/stripe-test/checkout';
  const body=live?(liveMethod==='crypto'?{...details,method:'crypto'}:{...details,language:lang,requestKey}):{...details,language:lang,requestKey};
  const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':me.csrf},body:JSON.stringify(body)}),data=await response.json();
  if(!response.ok)throw Error(data.error||t('Checkout non disponibile.'));
  location.assign(data.url);
 }catch(error){message.textContent=error.message;button.disabled=false;requestKey=crypto.randomUUID();}
};
if(!live&&q.get('result')==='success'&&q.get('order')){try{const r=await fetch('/api/billing/stripe-test/status?order='+encodeURIComponent(q.get('order'))),d=await r.json();if(!r.ok)throw Error(d.error);message.textContent=t(d.state==='test_paid'?'Pagamento di prova riuscito. Nessun piano reale è stato attivato.':'Il pagamento di prova è ancora in attesa.');}catch(error){message.textContent=t(error.message);}}
else if(!live&&q.get('result')==='cancelled')message.textContent=t('Pagamento di prova annullato. Puoi riprovare.');
}
