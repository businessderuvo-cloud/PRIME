import {plans} from './pricing.js?v=20261031-annual-prices-v2';

const params=new URLSearchParams(location.search),lang=window.primeI18n?.language||'it';
const copy=lang==='en'?{
 brand:'PRIME · SECURE PAYMENT',step:'STEP 1 OF 2',title:'Choose how to pay.',lead:'Choose a plan and payment method. For crypto, select your asset and network in the CPAY checkout.',plan:'Your plan',monthly:'Monthly',annual:'Annual',method:'Payment method',card:'Cards and digital wallets',bank:'Bank transfer · SEPA / SWIFT',crypto:'Crypto',sepa:'SEPA',swift:'SWIFT',asset:'Select cryptocurrency',network:'Select network',warning:'Send only the selected asset on the matching network. Using a different network can result in loss of funds.',continue:'Continue to checkout ↗',cardSummary:'Cards and eligible digital wallets through Stripe.',bankSummary:'',cryptoSummary:'Choose your asset and network in CPAY · manual renewal',cryptoAnnual:'3 months free',liveNote:'Stripe shows payment methods available for your country and device.',guestNote:'Guest checkout access active for up to 2 hours. Confirming on Stripe or CPAY makes a real payment.',bankNote:'',login:'Sign in as the agency owner to continue.',error:'Live checkout is not available.',cardBrandsNote:'Card and wallet availability varies by country and device.',klarnaNote:'Klarna when available.'
}:{
 brand:'PRIME · PAGAMENTO SICURO',step:'PASSAGGIO 1 DI 2',title:'Scegli come pagare.',lead:'Scegli il piano e il metodo di pagamento. Se scegli Crypto, selezioni valuta e rete nel checkout CPAY.',plan:'Il tuo piano',monthly:'Mensile',annual:'Annuale',method:'Metodo di pagamento',card:'Carte e wallet digitali',bank:'Bonifico bancario',crypto:'Crypto',sepa:'SEPA',swift:'SWIFT',asset:'Scegli la criptovaluta',network:'Scegli la rete',warning:'Invia solo l’asset selezionato sulla rete corrispondente. Una rete diversa può causare la perdita dei fondi.',continue:'Continua al checkout ↗',cardSummary:'Carte e wallet compatibili tramite Stripe.',bankSummary:'',cryptoSummary:'Scegli valuta e rete nel checkout CPAY · rinnovo manuale',cryptoAnnual:'3 mesi gratis',liveNote:'Stripe mostra i metodi disponibili per il tuo Paese e dispositivo.',guestNote:'Accesso ospite attivo per 2 ore. Confermare su Stripe o CPAY comporta un pagamento reale.',bankNote:'',login:'Accedi con il titolare dell’agenzia per continuare.',error:'Checkout live non disponibile.',cardBrandsNote:'La disponibilità di carte e wallet varia in base al Paese e al dispositivo.',klarnaNote:'Klarna, se disponibile.'
};
const money=value=>new Intl.NumberFormat(lang==='en'?'en-GB':'it-IT',{style:'currency',currency:'EUR'}).format(value);
const networkChoices={
 BTC:[{id:'5edf2767c9ca4d5a342bf8ac',name:'Bitcoin',detail:lang==='en'?'Native network':'Rete nativa',logo:'bitcoin.svg'}],
 USDC:[
  {id:'6336da3bca5405284b73d9ae',name:'Ethereum · ERC20',detail:'',logo:'ethereum.svg'},
  {id:'647c3c108268113f59a7197e',name:'Polygon',detail:'',logo:'polygon.svg'},
  {id:'6867e8d06b6b4ec18c2a0d84',name:'Base',detail:'',logo:'base.svg'},
  {id:'653621140b4afe0330d6bfff',name:'Solana',detail:'',logo:'solana.svg'}
 ]
};
const cardBrands=[
 ['Visa','visa.svg'],['Mastercard','mastercard.svg'],['American Express','american-express.svg'],['Discover','discover.svg'],
 ['JCB','jcb.svg'],['Diners Club','diners-club.svg'],['UnionPay','unionpay.svg'],['Cartes Bancaires','cartes-bancaires.svg']
];
const stripeMethods=[
 ['PayPal','paypal-monogram.png'],['iDEAL','ideal.svg'],
 ['Klarna','klarna-badge.svg'],['Revolut Pay','revolut.svg'],['Amazon Pay','amazon-pay.svg'],['Satispay','satispay.svg'],
 ['Apple Pay','apple-pay.svg'],['Google Pay','google-pay.svg']
];
const logoPath=name=>'/brands/checkout/'+name;
const paymentLogoPath=name=>name==='klarna-badge.svg'?'/brands/'+name:'/brands/checkout/methods/'+name;
const makeLogo=(file,alt,className)=>{const img=document.createElement('img');img.src=logoPath(file);img.alt=alt;img.className=className||'';img.draggable=false;return img;};
const brandMarkup=cardBrands.map(([name,file])=>'<span class="brand-chip" title="'+name+'"><img src="'+logoPath(file)+'" alt="'+name+'"></span>').join('');
const stripeMethodMarkup=stripeMethods.map(([name,file])=>'<span class="stripe-method-chip" title="'+name+'" aria-label="'+name+'"><img class="stripe-method-logo'+(file==='paypal-monogram.png'?' paypal-mark':file==='revolut.svg'?' revolut-mark':'')+'" src="'+paymentLogoPath(file)+'" alt="'+name+'" loading="lazy"></span>').join('');

document.title=lang==='en'?'PRIME · Choose how to pay':'PRIME · Scegli come pagare';
document.body.classList.add('live-choice-page');
const stylesheet=document.createElement('link');stylesheet.rel='stylesheet';stylesheet.href='/checkout-live-choice.css?v=20261031-payment-icons-v17';await new Promise(resolve=>{stylesheet.onload=resolve;stylesheet.onerror=resolve;document.head.append(stylesheet);});
const planOptions=Object.entries(plans).map(([id,p])=>'<option value="'+id+'">'+p.name+'</option>').join('');
document.body.innerHTML=
'<main class="choice-shell">'+
 '<header class="choice-top"><span class="brand">'+copy.brand+'</span><span class="step">'+copy.step+'</span></header>'+
 '<section class="choice-hero"><h1>'+copy.title+'</h1><p>'+copy.lead+'</p></section>'+
 '<section class="checkout-section plan-section"><label class="section-title" for="live-plan">'+copy.plan+'</label><div class="plan-row"><select id="live-plan" aria-label="'+copy.plan+'">'+planOptions+'</select><select id="live-cycle" aria-label="'+(lang==='en'?'Billing cycle':'Frequenza')+'"><option value="monthly">'+copy.monthly+'</option><option value="annual">'+copy.annual+'</option></select></div></section>'+
 '<section class="checkout-section method-section"><h2 class="section-title">'+copy.method+'</h2>'+
  '<div class="method-grid" role="group" aria-label="'+copy.method+'">'+
   '<button class="method card-method" type="button" data-method="card" aria-pressed="true"><span class="method-title">'+copy.card+'</span><span class="card-brands" role="img" aria-label="Visa, Mastercard, American Express, Discover, JCB, Diners Club, UnionPay, Cartes Bancaires">'+brandMarkup+'</span><span class="brand-note">'+copy.cardBrandsNote+'</span><span class="stripe-methods-title">'+(lang==='en'?'More Stripe methods':'Altri metodi Stripe')+'</span><span class="stripe-methods">'+stripeMethodMarkup+'</span><span class="brand-note">'+(lang==='en'?'Shown by Stripe when eligible for your country, currency and device.':'Stripe li mostra se compatibili con Paese, valuta e dispositivo.')+'</span></button>'+
   '<button class="method bank-method" type="button" data-method="bank" aria-pressed="false"><span class="method-title">'+copy.bank+'</span><span class="bank-symbols"><svg class="bank-icon" viewBox="0 0 32 32" aria-hidden="true"><path d="m3 12 13-8 13 8H3ZM6 14v11m7-11v11m6-11v11m7-11v11M4 27h24M3 30h26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg><span class="bank-badge" role="img" aria-label="Bonifico SEPA"><span class="sepa-letters">S</span><span class="euro-mark">€</span><span class="sepa-letters">PA</span></span><span class="transfer-network-chip" role="img" aria-label="Bonifico internazionale"><svg viewBox="0 0 40 28" aria-hidden="true"><circle cx="20" cy="14" r="10" fill="none" stroke="#27658f" stroke-width="1.8"/><path d="M10 14h20M20 4c4 3 5 6 5 10s-1 7-5 10m0-20c-4 3-5 6-5 10s1 7 5 10M12 8h16M12 20h16" fill="none" stroke="#27658f" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></span></span><span class="method-description">'+copy.bankSummary+'</span></button>'+
   '<button class="method crypto-method" type="button" data-method="crypto" aria-pressed="false"><span class="method-title">'+copy.crypto+'</span><span class="crypto-brands"><img src="'+logoPath('bitcoin.svg')+'" alt="Bitcoin"><span class="crypto-arrow" aria-hidden="true">↔</span><img src="'+logoPath('usdc.svg')+'" alt="USD Coin"></span><span class="method-description">Bitcoin · USD Coin</span></button>'+
  '</div></section>'+
 '<p id="message" role="status" aria-live="polite"></p><a class="login-link" id="login-link" href="/?account=login&return=checkout" hidden>'+copy.login+'</a>'+
 '<div class="checkout-actions"><div class="summary"><strong id="price"></strong><span id="summary-text"></span></div><div class="action-side"><button class="continue" id="live-continue" type="button">'+copy.continue+'</button><p class="note" id="live-note">'+copy.liveNote+'</p></div></div>'+
'</main>';

const requestedCoin=String(params.get('asset')||'BTC').toUpperCase();
let method=params.get('method')==='bank'?'bank':'card',coin=requestedCoin==='USDC'?'USDC':'BTC',selectedNetwork=networkChoices[coin][0],busy=false,requestKey=crypto.randomUUID(),guestCheckoutWindow=false;
const $=selector=>document.querySelector(selector),planSelect=$('#live-plan'),cycleSelect=$('#live-cycle'),continueButton=$('#live-continue'),message=$('#message');
try{const guest=await fetch('/api/public/live-checkout-access',{cache:'no-store'}),data=await guest.json();guestCheckoutWindow=guest.ok&&data.active===true;}catch{}
planSelect.value=Object.hasOwn(plans,params.get('plan'))?params.get('plan'):'standard';cycleSelect.value=params.get('cycle')==='annual'?'annual':'monthly';
const requestedNetwork=params.get('network'),networkMatch=networkChoices[coin].find(item=>item.id===requestedNetwork);if(networkMatch)selectedNetwork=networkMatch;
function drawCoins(){
 const list=$('#coin-list');list.replaceChildren();
 for(const option of [{symbol:'BTC',name:'Bitcoin',logo:'bitcoin.svg'},{symbol:'USDC',name:'USD Coin',logo:'usdc.svg'}]){
  const button=document.createElement('button');button.type='button';button.className='network coin-choice';button.setAttribute('aria-pressed',String(coin===option.symbol));
  const copyBlock=document.createElement('span');copyBlock.className='coin-copy';const title=document.createElement('strong'),ticker=document.createElement('small');title.textContent=option.name;ticker.textContent=option.symbol;copyBlock.append(title,ticker);button.append(makeLogo(option.logo,option.name,'coin-mark'),copyBlock);
  button.onclick=()=>{coin=option.symbol;selectedNetwork=networkChoices[coin][0];$('#coin-name').textContent=coin==='BTC'?'Bitcoin (BTC)':'USD Coin (USDC)';$('#coin-help').textContent=coin==='BTC'?networkChoices.BTC[0].detail:(lang==='en'?'Choose one of the supported networks':'Scegli una delle reti disponibili');drawCoins();drawNetworks();sync();};list.append(button);
 }
 $('#coin-name').textContent=coin==='BTC'?'Bitcoin (BTC)':'USD Coin (USDC)';
 $('#coin-help').textContent=coin==='BTC'?networkChoices.BTC[0].detail:(lang==='en'?'Choose one of the supported networks':'Scegli una delle reti disponibili');
}
function drawNetworks(){
 const bitcoin=coin==='BTC';$('#network-head').hidden=bitcoin;document.querySelector('.network-title').hidden=bitcoin;$('#network-list').hidden=bitcoin;document.querySelector('.hint').hidden=bitcoin;
 const list=$('#network-list');list.replaceChildren();
 for(const entry of networkChoices[coin]){
  const button=document.createElement('button');button.type='button';button.className='network';button.setAttribute('aria-pressed',String(selectedNetwork.id===entry.id));
  button.append(makeLogo(entry.logo,entry.name,'network-mark'));
  const label=document.createElement('span');label.className='network-copy';const name=document.createElement('strong');name.textContent=entry.name;label.append(name);
  if(entry.detail){const detail=document.createElement('small');detail.textContent=entry.detail;label.append(detail);}
  button.append(label);button.onclick=()=>{selectedNetwork=entry;drawNetworks();sync();};list.append(button);
 }
}
function sync(){
 const plan=plans[planSelect.value],annual=cycleSelect.value==='annual',amount=method==='crypto'&&annual?plan.monthly*9:annual?plan.annual:plan.monthly;
 $('#price').textContent=money(amount)+' / '+(annual?(lang==='en'?'year':'anno'):(lang==='en'?'month':'mese'));
 $('#summary-text').textContent=method==='card'?copy.cardSummary:method==='bank'?copy.bankSummary:copy.cryptoSummary+(annual?' · '+copy.cryptoAnnual:'');
 continueButton.disabled=busy;
 if(method==='bank'){ $('#live-note').textContent=copy.bankNote;$('#live-note').hidden=!copy.bankNote;continueButton.title=copy.bankNote; }
 else { $('#live-note').hidden=false;$('#live-note').textContent=guestCheckoutWindow?copy.guestNote:copy.liveNote;continueButton.title=''; }
}
document.querySelectorAll('[data-method]').forEach(button=>button.addEventListener('click',()=>{
 method=button.dataset.method;document.querySelectorAll('[data-method]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));message.textContent='';sync();
}));
planSelect.onchange=cycleSelect.onchange=sync;
sync();
continueButton.addEventListener('click',async()=>{
 if(busy)return;busy=true;sync();message.textContent=lang==='en'?'Preparing the live checkout…':'Preparo il checkout live…';
 try{
  const auth=await fetch('/api/me',{cache:'no-store'});if(!auth.ok){$('#login-link').hidden=false;throw Error(copy.login);}const me=await auth.json(),plan=plans[planSelect.value],details={plan:planSelect.value,cycle:cycleSelect.value,humans:plan.humans,ai:plan.ai,language:lang};
  const path=method==='crypto'?'/api/billing/checkout':'/api/billing/stripe/live/checkout',body=method==='crypto'?{...details,method:'crypto'}:{...details,requestKey};
  const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':me.csrf},body:JSON.stringify(body)}),data=await response.json();if(!response.ok)throw Error(data.error||copy.error);
  const next=new URL(data.url,location.origin);location.assign(next.href);
 }catch(error){message.textContent=error.message;busy=false;requestKey=crypto.randomUUID();sync();}
});
