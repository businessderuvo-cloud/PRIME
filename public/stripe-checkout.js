(()=>{
 let savedLanguage='it';try{savedLanguage=localStorage.getItem('prime-language')||'it';}catch{}
 const lang=['it','en'].includes(new URLSearchParams(location.search).get('lang'))?new URLSearchParams(location.search).get('lang'):(savedLanguage==='en'?'en':'it');
 const words={'Torna a PRIME':'Back to PRIME','Checkout non disponibile':'Checkout unavailable','Non autenticato':'Sign in to PRIME to continue','Ambiente di test':'Test environment','IL TUO SPAZIO, IL TUO FUTURO.':'YOUR SPACE, YOUR FUTURE.','Entra in PRIME.':'Join PRIME.','Pagamento sicuro con Stripe':'Secure payment with Stripe','Preparazione del checkout…':'Preparing checkout…','← Torna ai piani':'← Back to plans','Protetto da Stripe':'Secured by Stripe','IL TUO ABBONAMENTO':'YOUR SUBSCRIPTION','Abbonati in test':'Subscribe in test mode','Abbonandoti autorizzi gli addebiti ricorrenti indicati, fino alla disdetta.':'By subscribing, you authorise the recurring charges shown until you cancel.','Scegli un piano dal tuo account PRIME per continuare.':'Choose a plan from your PRIME account to continue.','Pagamento ricevuto. L’abbonamento di test viene aggiornato tramite conferma Stripe.':'Payment received. Your test subscription is updated through Stripe confirmation.','Checkout scaduto. Torna alla scelta del piano.':'Checkout expired. Return to plan selection.','Stripe non è stato caricato. Ricarica la pagina.':'Stripe did not load. Reload this page.','Pagamento di test ricevuto. Conferma Stripe in corso.':'Test payment received. Waiting for Stripe confirmation.','Pagamento non completato. Controlla l’esito prima di riprovare.':'Payment not completed. Check its status before trying again.'};
 const t=text=>lang==='en'?(words[text]||window.primeI18n?.t(text)||text):text;
 const message=document.querySelector('#message'),summary=document.querySelector('#summary');
 async function api(path,body,csrf){const r=await fetch(path,{credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json',...(body?{'X-CSRF-Token':csrf}:{})},...(body?{method:'POST',body:JSON.stringify(body)}:{})});const data=await r.json();if(!r.ok)throw Error(data.error||'Checkout non disponibile');return data;}
 async function start(){
  await window.primeI18n?.ready;document.documentElement.lang=lang;document.querySelector('header a').setAttribute('aria-label',t('Torna a PRIME'));for(const node of document.querySelectorAll('header span,.eyebrow,#title,#summary,#message,footer a,footer span'))node.textContent=t(node.textContent);for(const a of document.querySelectorAll('a[href="/"]'))a.href='/?lang='+lang;
  if(location.protocol==='file:')throw Error('Apri il checkout dal server PRIME, dopo aver scelto il piano.');
  const order=new URLSearchParams(location.search).get('order');if(!order)throw Error('Scegli un piano dal tuo account PRIME per continuare.');
  await api('/api/me');const data=await api('/api/billing/stripe-test/session?order='+encodeURIComponent(order));
  summary.textContent=`${data.plan.toUpperCase()} · ${new Intl.NumberFormat(lang==='en'?'en-GB':'it-IT',{style:'currency',currency:'EUR'}).format(data.amount/100)}/${data.cycle==='annual'?(lang==='en'?'year':'anno'):(lang==='en'?'month':'mese')}`;
  if(data.status==='complete'){message.textContent=t('Pagamento ricevuto. L’abbonamento di test viene aggiornato tramite conferma Stripe.');return;}
  if(data.status!=='open')throw Error('Checkout scaduto. Torna alla scelta del piano.');
  if(typeof Stripe!=='function')throw Error('Stripe non è stato caricato. Ricarica la pagina.');
  document.querySelector('#title').textContent='PRIME '+data.plan.toUpperCase();
  document.querySelector('#title').dataset.plan=data.plan;

  document.querySelector('.eyebrow').textContent='IL TUO ABBONAMENTO';
  const stripe=Stripe(data.publishableKey,{locale:lang}),checkout=stripe.initCheckoutElementsSdk({clientSecret:data.clientSecret,adaptivePricing:{allowed:true},elementsOptions:{appearance:{theme:'night',variables:{colorPrimary:'#d3b893',colorBackground:'#1b2330',colorText:'#f0f2f6',colorTextSecondary:'#a9b3c2',colorDanger:'#ff9999',fontFamily:'system-ui, sans-serif',borderRadius:'8px',spacingUnit:'3px'}}}});
  const loaded=await checkout.loadActions();if(loaded.type!=='success')throw Error(loaded.error.message);
  document.querySelector('#stripe-checkout').innerHTML='<div id="stripe-express"></div><div id="stripe-currency"></div><form id="stripe-form"><div id="stripe-contact"></div><div id="stripe-payment"></div><p class="renewal-terms">Abbonandoti autorizzi gli addebiti ricorrenti indicati, fino alla disdetta.</p><button id="subscribe" type="submit">Abbonati in test</button></form>';
  document.querySelector('.eyebrow').textContent=t('IL TUO ABBONAMENTO');
  document.querySelector('.renewal-terms').textContent=t('Abbonandoti autorizzi gli addebiti ricorrenti indicati, fino alla disdetta.');document.querySelector('#subscribe').textContent=t('Abbonati in test');
  const updateSummary=session=>{const currency=session.currency?.toUpperCase()||'EUR',amount=session.total?.total?.minorUnitsAmount;if(Number.isSafeInteger(amount)){const format=new Intl.NumberFormat(lang==='en'?'en-GB':'it-IT',{style:'currency',currency}),scale=10**format.resolvedOptions().maximumFractionDigits;summary.textContent=data.plan.toUpperCase()+' · '+format.format(amount/scale)+'/'+(data.cycle==='annual'?(lang==='en'?'year':'anno'):(lang==='en'?'month':'mese'));}document.querySelector('#stripe-currency').hidden=!session.currencyOptions||session.currencyOptions.length<2;};
  checkout.createCurrencySelectorElement().mount('#stripe-currency');updateSummary(loaded.actions.getSession());checkout.on('change',updateSummary);
  checkout.createContactDetailsElement().mount('#stripe-contact');
  checkout.createPaymentElement({layout:{type:'accordion',defaultCollapsed:false,radios:'always',spacedAccordionItems:false}}).mount('#stripe-payment');
  const express=checkout.createExpressCheckoutElement({buttonHeight:44,buttonTheme:{applePay:'white-outline',googlePay:'white'}});
  express.mount('#stripe-express');express.on('ready',event=>{document.querySelector('#stripe-express').hidden=!event.availablePaymentMethods||!Object.values(event.availablePaymentMethods).some(Boolean);});
  let busy=false;
  async function confirm(expressEvent){
   if(busy)return;busy=true;const button=document.querySelector('#subscribe');button.disabled=true;message.textContent='';
   try{const result=await loaded.actions.confirm({...expressEvent?{expressCheckoutConfirmEvent:expressEvent}:{},returnUrl:location.origin+location.pathname+location.search});if(result.type==='error')message.textContent=result.error.message;else{message.textContent=t('Pagamento di test ricevuto. Conferma Stripe in corso.');document.querySelector('#stripe-form').hidden=true;}}
   catch{message.textContent=t('Pagamento non completato. Controlla l’esito prima di riprovare.');}
   finally{busy=false;button.disabled=false;}
  }
  express.on('confirm',event=>confirm(event));
  document.querySelector('#stripe-form').onsubmit=event=>{event.preventDefault();confirm();};message.textContent='';
 }
 start().catch(e=>{message.textContent=t(e.message);});
})();
