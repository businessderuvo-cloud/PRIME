import {plans,estimate,usageKeys,customerRates} from './pricing.js?v=20261030-stripe-prices';
const $=s=>document.querySelector(s);
const cryptoCoins="<span class=\"crypto-coins\"><span class=\"crypto-coin\"><span class=\"crypto-mark\"><svg viewBox=\"0 0 32 32\" aria-hidden=\"true\"><path fill=\"currentColor\" d=\"m23 14 .4-2.3c.2-2-1.3-3.1-3.5-3.8l.7-2.8-1.7-.4-.7 2.7-1.4-.3.7-2.7-1.7-.4-.7 2.8-3.5-.9-.5 1.9 1.3.3c.7.2.8.6.7 1.1l-2 8c-.1.3-.4.6-.9.5l-1.3-.3-.9 2 3.5.9-.7 2.8 1.7.4.7-2.8 1.4.4-.7 2.7 1.7.4.7-2.8c3.1.6 5.4.3 6.3-2.4.7-2.1 0-3.3-1.6-4.1 1.2-.3 2-1.1 2.3-2.6ZM19.5 19c-.5 1.9-3.7.9-4.8.6l.8-3.3c1.1.3 4.5.8 4 2.7Zm.5-6c-.4 1.8-3.1.9-4 .7l.8-3c.9.2 3.7.6 3.2 2.3Z\"/></svg></span><span class=\"sr-only\">Bitcoin</span></span><span class=\"crypto-coin\"><span class=\"crypto-mark\"><svg viewBox=\"0 0 32 32\" aria-hidden=\"true\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\"><path d=\"M10.5 5.7a11.7 11.7 0 0 0 0 20.6M21.5 5.7a11.7 11.7 0 0 1 0 20.6M19.4 12.3c-.8-1.8-6.5-2.1-6.5.8 0 3.1 6.5 1.6 6.5 5 0 2.8-5.6 3-6.8.7M16 8.5V11m0 10v2.5\"/></svg></span><span class=\"sr-only\">USDC</span></span></span>";
const setPageWidth=()=>document.documentElement.style.setProperty("--page-width",document.documentElement.clientWidth+"px");
setPageWidth();window.addEventListener("resize",setPageWidth,{passive:true});
const paths={
  home:'M3 10 12 3l9 7v11h-6v-7H9v7H3Z',
  building:'M4 21V3h12v18M16 9h4v12M8 7h4M8 11h4M8 15h4M9 21v-3h2v3',
  users:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M16 3a4 4 0 0 1 0 8M22 21v-2a4 4 0 0 0-3-3.87M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  crown:'m2 6 5 4 5-7 5 7 5-4-3 14H5Z',
  diamond:'m3 8 4-5h10l4 5-9 13ZM3 8h18M7 3l5 18 5-18',
  infinity:'M12 12c-3-5-5-6-7-5-4 2-4 8 0 10 2 1 4 0 7-5s5-6 7-5c4 2 4 8 0 10-2 1-4 0-7-5',
  search:'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  sparkles:'m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5ZM20 2v4M18 4h4',
  phone:'M22 16.9v3a2 2 0 0 1-2.2 2 20 20 0 0 1-8.6-3.1 20 20 0 0 1-6.1-6.1A20 20 0 0 1 2 4.1 2 2 0 0 1 4 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.5 2.1L8 10a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.9.6 2.9.7a2 2 0 0 1 1.7 2',
  calendar:'M4 5h16v16H4ZM8 2v6M16 2v6M4 11h16M8 15h2M14 15h2',
  check:'m5 12 4 4L19 6',
  minus:'M6 12h12',
  file:'M14 2H4v20h16V8ZM14 2v6h6M8 13h8M8 17h6',
  clock:'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0M12 6v6l4 2',
  link:'M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2',
  mail:'M3 5h18v14H3ZM3 5l9 7 9-7',
  chart:'M3 3v18h18M7 16l4-5 4 2 5-7',
  mic:'M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0ZM5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8',
  moon:'M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10',
  sun:'M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
};
function icon(name,extra=''){return `<svg class="icon ${extra}" viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name]||paths.check}"/></svg>`;}
document.querySelectorAll('[data-icon]').forEach(el=>el.insertAdjacentHTML('afterbegin',icon(el.dataset.icon)));
const euro=(v,d=0)=>new Intl.NumberFormat((window.primeI18n?.language==='en'?'en-GB':'it-IT'),{style:'currency',currency:'EUR',minimumFractionDigits:d,maximumFractionDigits:Math.max(2,d)}).format(v);
const integer=v=>new Intl.NumberFormat((window.primeI18n?.language==='en'?'en-GB':'it-IT')).format(v);
const symbols={standard:'home',pro:'users',vip:'crown',elite:'diamond',secret:'infinity'};
const descriptions={standard:'L’essenziale per iniziare',pro:'Più strumenti, più controllo',vip:'La tua agenzia, con l’AI',elite:'Più capacità, più possibilità',secret:'Per franchising e grandi volumi'};
const benefits={
 standard:['Gestionale Base completo','2 agenti umani inclusi','Extra umani: 55,25 €/mese ciascuno','Supporto solo email'],
 pro:['Tutto Standard + integrazioni','Importazione dati da altri gestionali','10 agenti umani inclusi','Extra umani: 27,63 €/mese ciascuno','AI Assistant base','Supporto solo email'],
 vip:['Tutte le funzionalità Pro','Agenti umani illimitati','1 agente AI · extra 110,49 €/mese','1.238 minuti · 225 op. semplici','50 indagini medie · 20 complesse','Email + WhatsApp prioritario','Attivazione entro 24 ore lavorative'],
 elite:['Tutte le funzionalità VIP','Agenti umani illimitati','2 agenti AI · extra 55,25 €/mese','Voce AI personalizzata','3.738 minuti · 675 op. semplici','150 indagini medie · 60 complesse','Stripe Connect: incassi, fatture e report finanziari','Carte aziendali · in arrivo','Email + WhatsApp prioritario','Assistenza remota con TeamViewer','Attivazione entro 24 ore lavorative'],
 secret:['Configurazione personalizzata','Quote per grandi volumi','Integrazioni dedicate','Stripe Connect: incassi, fatture e report finanziari','Carte aziendali · in arrivo','Assistenza remota con TeamViewer','Accordi di supporto su misura','Attivazione entro 24 ore lavorative']};
let annual=false;
function drawPlans(){
 $('.crypto-promo').hidden=!annual;$('#annual-crypto-note').hidden=!annual;
 $('#plan-cards').innerHTML=[...Object.keys(plans),'secret'].map(id=>{const p=plans[id];return `<article class="plan ${id==='vip'?'featured':''}">${id==='vip'?'<span class="plan-tag">PIÙ SCELTO</span>':''}${icon(symbols[id],'plan-symbol')}<h3>${p?.name.toUpperCase()||'SECRET PLAN'}</h3><p class="plan-description">${descriptions[id]}</p><p class="price"><strong>${p?euro(annual&&p.annual?p.annual:p.monthly):'Su preventivo'}</strong>${p?` <small>/${annual&&p.annual?'anno':'mese'}</small>`:''}</p><p class="annual-note">${p?.annual?(annual?`${euro(p.annual/12,2)}/mese equivalenti · pagamento annuale`:`${euro(p.annual)}/anno con l’annuale`):id==='secret'?'Un piano disegnato sulla tua rete':'Fatturazione mensile'}</p><div class="klarna-plan"><img src="/brands/klarna-badge.svg" alt="Klarna" width="68" height="29" loading="lazy"><span>Klarna · rate disponibili previa approvazione</span></div>${p&&annual?`<div class="crypto-offer"><span class="crypto-offer-label">PAGHI IN CRYPTO?</span>${cryptoCoins}<strong class="crypto-offer-gift">3 MESI GRATIS</strong><span class="crypto-offer-price">${euro(Math.round(p.monthly*100*(annual?9:1))/100,2)}<span>/${annual?'anno':'mese'}</span></span><p>2 mesi dell’annuale + 1 mese extra crypto. <b>Sconto già incluso.</b></p></div>`:''}<${id==='secret'?'button':'a'} ${id==='secret'?'type="button" data-contact':'href="#inizia"'} class="button ${id==='vip'?'primary':''}">${id==='secret'?'Richiedi informazioni':'Scopri come iniziare'}</${id==='secret'?'button':'a'}><ul>${benefits[id].map(t=>`<li>${icon('check')}<span>${t}</span></li>`).join('')}</ul></article>`;}).join('');
 $('[data-contact]').onclick=()=>openAccount('contact');
}
document.querySelectorAll('[name=billing]').forEach(x=>x.onchange=()=>{annual=x.value==='annual';drawPlans();});drawPlans();
const yes=true,no=false,all=[yes,yes,yes,yes],pro=[no,yes,yes,yes],ai=[no,no,yes,yes];
const rows=[
 ['category','Persone, assistenza e quote mensili'],
 ['users','Agenti umani inclusi',['2','10','Illimitati','Illimitati']],
 ['users','Ogni agente umano extra / mese',[euro(plans.standard.humanExtra),euro(plans.pro.humanExtra),'Incluso','Incluso']],
 ['mail','Supporto',['Solo email','Solo email','Email + WhatsApp prioritario','Email + WhatsApp prioritario']],
 ['link','Assistenza remota con TeamViewer',[no,no,no,'Inclusa']],
 ['sparkles','Agenti AI inclusi',[no,no,'1','2']],
 ['sparkles','Ogni agente AI extra / mese',[no,no,euro(plans.vip.aiExtra),euro(plans.elite.aiExtra)]],
 ['phone','Minuti di conversazioni AI',[no,no,'1.238','3.738']],
 ['sparkles','Operazioni semplici',[no,no,'225','675']],
 ['search','Indagini Detective medie',[no,no,'50','150']],
 ['search','Indagini Detective complesse',[no,no,'20','60']],
 ['category','Il gestionale Base · incluso da Standard'],
 ['search','Dashboard, ricerca contestuale e universale',all],
 ['building','Vie, civici, appartamenti e piani',all],
 ['building','Foto citofoni e immobili, proprietari e storico',all],
 ['users','CRM, contatti, numeri multipli, social e lead caldi',all],
 ['home','Immobili, richieste acquirenti e matching',all],
 ['users','Trattative, proposte, visite e feedback',all],
 ['file','Contratti, documenti e locazioni',all],
 ['calendar','Calendario interno',all],
 ['clock','WPS, pianificazione, timer ed esiti',all],
 ['mic','Dettatura vocale',all],
 ['sun','Tema chiaro/scuro e interfaccia mobile',all],
 ['category','Pro · integrazioni e controllo'],
 ['file','Importazione dati da altri gestionali',pro],
 ['sparkles','AI Assistant base',pro],
 ['home','Collegamento ai portali immobiliari',pro],
 ['link','API e integrazioni',pro],
 ['calendar','Sincronizzazione calendari esterni',pro],
 ['mail','Email: mittente, oggetto e collegamento al provider',pro],
 ['chart','Contabilità e provvigioni per agente e titolare',pro],
 ['category','VIP ed Elite · operatività AI avanzata'],
 ['sparkles','AI avanzata e agenti AI',ai],
 ['home','Gestione annunci con AI',ai],
 ['phone','Chiamate AI',ai],
 ['mic','Voce personalizzata per le chiamate AI',[no,no,no,yes]],
 ['file','Istruzioni su presentazione, frasi e registro di cortesia',ai],
 ['file','Riassunto, trascrizione e download TXT',ai],
 ['search','Detective',ai],
 ['link','API per le funzionalità AI avanzate',ai],
 ['chart','Stripe Connect: incassi, fatture e report finanziari',[no,no,no,yes]],
];
$('#comparison').innerHTML=rows.map(([name,label,values])=>name==='category'?`<tr class="category"><th colspan="6">${label}</th></tr>`:`<tr><th scope="row"><span class="row-label">${icon(name)}${label}</span></th>${values.map(v=>`<td>${v===true?`${icon('check')}<span class="sr-only">Incluso</span>`:v===false?`${icon('minus')}<span class="sr-only">Non incluso</span>`:v}</td>`).join('')}<td>${['Assistenza remota con TeamViewer','Stripe Connect: incassi, fatture e report finanziari'].includes(label)?'Inclusa':'Su preventivo'}</td></tr>`).join('');
const labels={minutes:'Minuti di conversazioni AI',simple:'Operazioni semplici',medium:'Indagini Detective medie',complex:'Indagini Detective complesse'};
const quotaKeys=['minutes','simple','medium','complex'];
let rates={...customerRates};
const usageMaximums={minutes:20000,simple:3000,medium:1000,complex:500};
const usageDefaults={minutes:1238,simple:225,medium:50,complex:20};
$('#usage-controls').innerHTML=usageKeys.map(key=>`<div class="usage-row"><div><label for="usage-${key}">${labels[key]} / mese</label><input id="usage-${key}" name="${key}" type="number" min="0" max="10000000" step="1" value="${usageDefaults[key]}" required></div><input id="usage-${key}-range" type="range" min="0" max="${usageMaximums[key]}" step="1" value="${usageDefaults[key]}" aria-label="Regola ${labels[key].toLowerCase()}"></div>`).join('');
for(const key of usageKeys){
 const field=$('#usage-'+key),slider=$('#usage-'+key+'-range');
 slider.addEventListener('input',()=>{field.value=slider.value;});
 field.addEventListener('input',()=>{if(!field.validity.valid||field.value==='')return;slider.max=Math.max(usageMaximums[key],Number(field.value));slider.value=field.value;});
}
function drawEstimate(){
 if(!$('#usage-form').checkValidity())return;
 const agents=Number($('#ai-agents').value),usage=Object.fromEntries(usageKeys.map(key=>[key,Number($('#usage-'+key).value)]));
 $('#ai-minus').disabled=agents<=1;$('#ai-plus').disabled=agents>=1000;
 const quotes=Object.fromEntries(['vip','elite'].map(id=>[id,estimate(id,agents,usage,rates)]));
 const winner=quotes.vip.total<=quotes.elite.total?'vip':'elite';
 $('#estimate-cards').innerHTML=['vip','elite'].map(id=>{const plan=plans[id],quote=quotes[id],extra=Math.max(0,agents-plan.ai);return `<article class="estimate ${winner===id?'winner':''}"><h3>${icon(symbols[id])}${plan.name}</h3><p class="price"><strong>${euro(quote.total,2)}</strong> <small>/mese</small></p><dl><dt>Canone mensile</dt><dd>${euro(plan.monthly)}</dd><dt>Agenti AI aggiuntivi (${extra})</dt><dd>${euro(quote.extraAgents)}</dd>${quotaKeys.map((key,index)=>`<dt>${labels[key]} inclusi</dt><dd>${integer(plan.quotas[index])}</dd><dt>${labels[key]} extra (${integer(quote.extras[index].units)})</dt><dd>${euro(quote.extras[index].cents/100,2)}</dd>`).join('')}<dt>Totale consumi extra</dt><dd>${euro(quote.consumption,2)}</dd></dl><a href="#inizia" class="button">Come attivare ${plan.name} ↗</a></article>`;}).join('');
 const difference=Math.round((quotes.vip.total-quotes.elite.total)*100)/100;
 $('#savings').textContent=difference===0?'VIP ed Elite hanno lo stesso totale per questi consumi.':`Con questi consumi ${difference>0?'Elite':'VIP'} costa ${euro(Math.abs(difference),2)} in meno al mese.`;
 $('#rates').textContent=`Minuti AI extra (voce + elaborazione AI): ${euro(rates.minutes,5)}/min. Operazioni semplici: ${euro(rates.simple,4)} ciascuna; indagini medie: ${euro(rates.medium,3)}; complesse: ${euro(rates.complex,3)}. Si paga solo il consumo oltre la rispettiva quota inclusa. Le quote sono condivise dall’agenzia e non aumentano aggiungendo agenti AI. Costi telefonici e abbonamenti esterni separati.`;
}
$('#usage-form').addEventListener('input',drawEstimate);
$('#ai-minus').onclick=()=>{$('#ai-agents').stepDown();drawEstimate();};$('#ai-plus').onclick=()=>{$('#ai-agents').stepUp();drawEstimate();};$('#usage-form').onsubmit=e=>e.preventDefault();drawEstimate();
fetch('/api/public/pricing').then(r=>{if(!r.ok)throw Error('Tariffe non disponibili');return r.json();}).then(data=>{if(usageKeys.every(key=>Number.isFinite(data.overage?.[key])&&data.overage[key]>=0)){rates=data.overage;drawEstimate();}}).catch(()=>{});
function setTheme(theme){document.documentElement.dataset.theme=theme;$('#theme').innerHTML=icon(theme==='light'?'moon':'sun');$('#theme').setAttribute('aria-label',`Attiva tema ${theme==='light'?'scuro':'chiaro'}`);try{localStorage.setItem('prime-landing-theme',theme);}catch{}}
let savedTheme='dark';try{savedTheme=localStorage.getItem('prime-landing-theme')||'dark';}catch{}setTheme(savedTheme==='light'?'light':'dark');$('#theme').onclick=()=>setTheme(document.documentElement.dataset.theme==='light'?'dark':'light');
const dialog=$('#account-dialog');$('#close-dialog').onclick=()=>dialog.close();
const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let me=null;
async function api(url,body){const r=await fetch(url,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(me?{'X-CSRF-Token':me.csrf}:{})},...(body?{body:JSON.stringify(body)}:{})});const data=await r.json();if(!r.ok)throw new Error(data.error||'Servizio non disponibile');return data;}
async function openAccount(mode='register'){
 if(!dialog.open)dialog.showModal();
 if(mode==='contact'){
  $('#account-content').innerHTML='<p class="eyebrow">SECRET PLAN</p><h2 id="account-title">Costruiamo il piano della tua rete.</h2><p class="muted">Registrati con il nome del franchising. Potrai richiedere un piano personalizzato dal tuo account.</p><div class="dialog-actions"><button class="button primary" id="contact-register">Accedi o registra il franchising</button></div>';
  $('#contact-register').onclick=()=>openAccount('register');return;
 }
 $('#account-content').innerHTML=`<p class="eyebrow">IL TUO SPAZIO PRIME</p><h2 id="account-title">${mode==='register'?'Benvenuto in PRIME.':'Bentornato.'}</h2><p class="muted">${mode==='register'?'Crea l’account. Completerai la verifica aziendale prima di scegliere il piano.':'Accedi per verificare lo stato della tua agenzia.'}</p><form id="account-form">${mode==='register'?'<label>Nome agenzia o franchising<input name="agency" autocomplete="organization" required maxlength="120"></label>':''}<label>Email<input name="email" type="email" autocomplete="username" required maxlength="254"></label><label>Password<input name="password" type="password" autocomplete="${mode==='register'?'new-password':'current-password'}" required minlength="12" maxlength="128"></label><span class="fineprint">Password da 12 a 128 caratteri. <a href="/privacy">Informativa privacy</a></span><button class="button primary" type="submit">${mode==='register'?'Crea account':'Accedi'}</button></form><p class="fineprint">${mode==='register'?'Hai già un account?':'Non hai un account?'} <button id="switch-auth" class="text-button">${mode==='register'?'Accedi':'Registrati'}</button></p><p class="message" id="account-message" role="status"></p>`;
 $('#switch-auth').onclick=()=>openAccount(mode==='register'?'login':'register');
 $('#account-form').onsubmit=async e=>{e.preventDefault();const b=e.target.querySelector('button[type=submit]');b.disabled=true;try{const result=await api('/api/auth',{mode,...Object.fromEntries(new FormData(e.target))});
 if(result.requires_email_verification){$('#account-content').innerHTML='<h2 id="account-title">Controlla la tua email.</h2><p>Ti abbiamo inviato un link per confermare il tuo indirizzo. Dopo la conferma potrai accedere.</p><a class="button primary" href="/app">Vai all’accesso</a>';return;}
 if(result.requires_two_factor){location.assign('/app');return;}
 await showStatus();}catch(error){$('#account-message').textContent=error.message;$('#account-message').classList.add('error');b.disabled=false;}};
 try{me=await api('/api/me');await showStatus();}catch{me=null;}
}
async function showStatus(){
 me=await api('/api/me');const status=await api('/api/billing/status');
 $('#account-content').innerHTML=`<p class="eyebrow">LA TUA AGENZIA</p><h2 id="account-title">${esc(me.tenant)}</h2><div class="account-status"><strong>${status.kyb==='approved'?'Verifica aziendale approvata':'Verifica aziendale da completare'}</strong><p>${status.kyb==='approved'?'Puoi ora scegliere il piano della tua agenzia.':'L’account è stato creato. La scelta del piano e il pagamento rimangono bloccati fino all’approvazione KYB.'}</p></div><div id="billing-actions"></div><p class="message" id="account-message" role="status"></p>`;
 const quoteButton=document.createElement('button');quoteButton.className='text-button';quoteButton.textContent='Richiedi preventivo Secret Plan';quoteButton.onclick=()=>{
  $('#billing-actions').innerHTML='<form id="quote-form"><label>Raccontaci la tua rete<textarea name="message" rows="4" minlength="10" maxlength="3000" required placeholder="Numero sedi, volumi e integrazioni richieste"></textarea></label><button class="button primary" type="submit">Salva richiesta di preventivo</button></form>';
  $('#quote-form').onsubmit=async e=>{e.preventDefault();const b=e.target.querySelector('button');b.disabled=true;try{await api('/api/billing/enquiry',Object.fromEntries(new FormData(e.target)));$('#account-message').textContent='Richiesta salvata e associata alla tua agenzia. Nessun acquisto effettuato.';}catch(error){$('#account-message').textContent=error.message;}finally{b.disabled=false;}};
 };
 try{
  const usage=await api('/api/billing/usage'),section=document.createElement('section');section.className='usage-account';
  const date=v=>new Date(v).toLocaleDateString((window.primeI18n?.language==='en'?'en-GB':'it-IT'));
  section.innerHTML=`<h3>I consumi della tua agenzia</h3><p class="fineprint">Ciclo ${date(usage.cycle.start)} – ${date(usage.cycle.end)}. Rinnovo automatico delle quote alla fine del ciclo.</p>${usage.lines.map(line=>`<div class="usage-account-row"><strong>${labels[line.kind]}</strong><span>${integer(line.used)} / ${integer(line.included)}</span><small>Extra: ${integer(line.extra)} · ${euro(line.extraEur,2)}</small></div>`).join('')}<p><strong>Totale consumi extra: ${euro(usage.totalExtraEur,2)}</strong></p><details><summary>Ultimi consumi del ciclo</summary>${usage.events.map(event=>`<p class="fineprint">${date(event.date)} · ${esc(event.agentId)} · ${labels[event.kind]} · ${event.units}</p>`).join('')||'<p class="fineprint">Nessun consumo registrato.</p>'}</details>`;
  $('#account-content').append(section);
 }catch(error){if(!/abbonamento AI attivo/.test(error.message))console.warn('Riepilogo consumi non disponibile');}
 if(status.kyb!=='approved'){
  $('#billing-actions').innerHTML='<button id="start-kyb" class="button primary">Avvia verifica aziendale</button>';
  $('#start-kyb').onclick=async()=>{try{const data=await api('/api/billing/kyb',{});location.assign(data.url);}catch(error){$('#account-message').textContent=error.message;}};
 }else{
  $('#billing-actions').innerHTML='<form id="checkout-form"><label>Piano<select id="checkout-plan"><option value="standard">Standard · 55,58 €/mese</option><option value="pro">Pro · 110,82 €/mese</option><option value="vip">VIP · 552,76 €/mese</option><option value="elite">Elite · 1.105,19 €/mese</option><option value="secret">Secret Plan · su preventivo</option></select></label><label>Pagamento<select id="checkout-method"><option value="stripe">Stripe · TEST · Carte e Klarna</option><option value="crypto">Crypto · rinnovo manuale</option></select></label><label>Fatturazione<select id="checkout-cycle"><option value="monthly">Mensile</option><option value="annual">Annuale</option></select></label><label id="human-count-label">Agenti umani totali<input id="checkout-humans" type="number" min="1" max="1000" step="1" value="2" required></label><label id="ai-count-label" hidden>Agenti AI totali<input id="checkout-ai" type="number" min="1" max="1000" step="1" value="1"></label><p class="fineprint" id="checkout-summary"></p><button type="submit" class="button primary">Continua al pagamento</button></form>';
  const syncCheckout=()=>{const id=$('#checkout-plan').value,p=plans[id],isAI=!!p?.ai;$('#human-count-label').hidden=isAI||id==='secret';$('#ai-count-label').hidden=!isAI;$('#checkout-humans').disabled=isAI||id==='secret';$('#checkout-ai').disabled=!isAI;$('#checkout-cycle').disabled=!p?.annual;if(!p?.annual)$('#checkout-cycle').value='monthly';if(p?.humans){$('#checkout-humans').min=p.humans;if(Number($('#checkout-humans').value)<p.humans)$('#checkout-humans').value=p.humans;}if(p?.ai){$('#checkout-ai').min=p.ai;if(Number($('#checkout-ai').value)<p.ai)$('#checkout-ai').value=p.ai;}const yearly=$('#checkout-cycle').value==='annual',stripe=$('#checkout-method').value==='stripe';const extra=p?.humans?Math.max(0,Number($('#checkout-humans').value)-p.humans)*p.humanExtra:isAI?Math.max(0,Number($('#checkout-ai').value)-p.ai)*p.aiExtra:0;$('#checkout-summary').innerHTML=p?`${yearly&&!stripe?cryptoCoins+'<strong>3 MESI GRATIS TOTALI</strong>':''}<strong>${euro(Math.round((yearly?(stripe?p.annual+extra*12:p.monthly*9):p.monthly+(stripe?extra:0))*100)/100,2)}/${yearly?'anno':'mese'}</strong>${stripe?'Stripe in modalità test. Nessun addebito reale.':yearly?'2 mesi di base + 1 extra crypto. Sconto già incluso.':'Canone mensile senza sconto crypto.'} Gli extra crypto richiedono un’offerta dedicata.`:'Preventivo personalizzato richiesto prima del pagamento.';$('#checkout-form button[type=submit]').textContent=id==='secret'?'Richiedi preventivo':'Continua al pagamento';};
  ['checkout-method','checkout-plan','checkout-cycle','checkout-humans','checkout-ai'].forEach(id=>$('#'+id).oninput=syncCheckout);syncCheckout();
  $('#checkout-form').onsubmit=async e=>{e.preventDefault();if($('#checkout-plan').value==='secret'){quoteButton.click();return;}const b=e.target.querySelector('button[type=submit]');b.disabled=true;try{const stripe=$('#checkout-method').value==='stripe';const data=await api(stripe?'/api/billing/stripe-test/checkout':'/api/billing/checkout',{method:$('#checkout-method').value,language:window.primeI18n?.language||'it',requestKey:crypto.randomUUID(),plan:$('#checkout-plan').value,cycle:$('#checkout-cycle').value,humans:Number($('#checkout-humans').value),ai:Number($('#checkout-ai').value)});location.assign(data.url);}catch(error){$('#account-message').textContent=error.message;b.disabled=false;}};
 }
}
document.querySelectorAll('[data-auth]').forEach(b=>b.onclick=()=>openAccount(b.dataset.auth));

// Keep desktop billing controls within the photographed laptop, independent of crop.
const billingToggle=document.querySelector('.billing-toggle');
const billingHome=billingToggle.parentElement;
const heroPhoto=document.querySelector('.hero-photo');
const plansIntro=billingHome.querySelector('div');
const heroCopy=document.querySelector('.hero-copy');
plansIntro.classList.add('plans-intro');
function positionBilling(){
 const desktop=matchMedia('(min-width:1200px)').matches;
 if(!desktop){if(plansIntro.parentElement!==billingHome)billingHome.prepend(plansIntro);if(billingToggle.parentElement!==billingHome)billingHome.append(billingToggle);billingToggle.classList.remove('on-laptop');heroPhoto.closest('.hero').style.removeProperty('--hero-photo-height');return;}
 if(plansIntro.parentElement!==heroCopy)heroCopy.append(plansIntro);
 if(billingToggle.parentElement!==heroPhoto)heroPhoto.append(billingToggle);
 billingToggle.classList.add('on-laptop');
 const w=heroPhoto.clientWidth,iw=w,ih=w*1140/1380;
 heroPhoto.closest('.hero').style.setProperty('--hero-photo-height',Math.ceil(ih)+'px');
 const h=heroPhoto.clientHeight;
 heroPhoto.style.setProperty('--portrait-width',iw+'px');heroPhoto.style.setProperty('--portrait-height',ih+'px');
 billingToggle.style.setProperty('--laptop-x',(w-iw+iw*.65)+'px');
 billingToggle.style.setProperty('--laptop-y',(ih*.785)+'px');
 billingToggle.style.setProperty('--laptop-width',(iw*.335)+'px');
}
new ResizeObserver(positionBilling).observe(heroPhoto);window.addEventListener('resize',positionBilling,{passive:true});positionBilling();
heroPhoto.closest('.hero').insertAdjacentHTML('afterend',`<section class="cloudtalk-feature wrap" aria-labelledby="cloudtalk-title">
 <div class="cloudtalk-card">
  <div class="cloudtalk-copy"><p class="eyebrow">IL NUMERO PER LE TUE CHIAMATE AI</p><h2 id="cloudtalk-title">Ti serve un numero VoIP per gli AI Agent?</h2><p>Collega un numero telefonico agli agenti AI PRIME basati su ElevenLabs. Scegli una soluzione professionale con CloudTalk oppure l’alternativa più economica ed essenziale di Zadarma. I servizi telefonici hanno abbonamenti e consumi separati dai minuti AI PRIME.</p></div>
  <div class="voip-options">
   <article class="voip-option"><a class="cloudtalk-brand" href="https://www.cloudtalk.io/" target="_blank" rel="noopener noreferrer" aria-label="Visita CloudTalk"><img src="/assets/cloudtalk-logo.svg" alt="CloudTalk" width="136" height="16"></a><h3>La soluzione più professionale</h3><p><strong>Consigliamo CloudTalk solo per un piano senza AI Agent.</strong> Usa la telefonia insieme agli agenti AI PRIME. CloudTalk può offrire anche un proprio AI Agent, ma è più costoso e <strong>solo parzialmente integrabile con PRIME</strong>: non ha accesso autonomo ai dati del gestionale. I dati da usare in Copilot e per le ricerche devono essere caricati manualmente.</p></article>
   <article class="voip-option"><a class="cloudtalk-brand zadarma-brand" href="https://zadarma.com/it/?ref=880d9879e576f890c9488173d439235e" target="_blank" rel="noopener noreferrer sponsored" aria-label="Visita Zadarma, link affiliato"><img src="/assets/zadarma-logo.svg" alt="Zadarma" width="116" height="30"></a><h3>L’alternativa più economica ed essenziale</h3><p>Una soluzione meno strutturata per chi cerca soprattutto un numero VoIP. <strong>L’integrazione Zadarma include SOLO il numero di telefono</strong>, senza AI Agent: l’intelligenza artificiale rimane quella degli agenti PRIME.</p><p class="fineprint">Link affiliato: PRIME può ricevere una commissione.</p></article>
  </div>
  <div class="cloudtalk-business-email"><div class="cloudtalk-email-copy"><strong>Per registrarti a CloudTalk serve un’email aziendale.</strong><p>Usa un indirizzo sul dominio della tua agenzia. Per scegliere il servizio di posta aziendale, consulta i partner PRIME.</p><a class="text-link" href="/partners#partner-ufficiali">Scopri i partner per la posta aziendale <span aria-hidden="true">↗</span></a></div></div>
 </div>
</section>`);
