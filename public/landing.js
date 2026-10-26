import {plans,estimate,usageKeys,customerRates} from './pricing.js';
const $=s=>document.querySelector(s);
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
const euro=(v,d=0)=>new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR',minimumFractionDigits:d,maximumFractionDigits:2}).format(v);
const integer=v=>new Intl.NumberFormat('it-IT').format(v);
const symbols={standard:'home',pro:'users',vip:'crown',elite:'diamond',secret:'infinity'};
const descriptions={standard:'L’essenziale per iniziare',pro:'Più strumenti, più controllo',vip:'La tua agenzia, con l’AI',elite:'Più capacità, più possibilità',secret:'Per franchising e grandi volumi'};
const benefits={
 standard:['Gestionale Base completo','2 agenti umani inclusi','Extra umani: 50 €/mese ciascuno','Supporto solo email'],
 pro:['Tutto Standard + integrazioni','Importazione dati da altri gestionali','10 agenti umani inclusi','Extra umani: 25 €/mese ciascuno','AI Assistant base','Supporto solo email'],
 vip:['Tutte le funzionalità Pro','Agenti umani illimitati','1 agente AI · extra 100 €/mese','1.238 minuti · 225 op. semplici','50 indagini medie · 20 complesse','Email + WhatsApp prioritario','Attivazione entro 24 ore lavorative'],
 elite:['Tutte le funzionalità VIP','Agenti umani illimitati','2 agenti AI · extra 50 €/mese','Voce AI personalizzata','3.738 minuti · 675 op. semplici','150 indagini medie · 60 complesse','Email + WhatsApp prioritario','Attivazione entro 24 ore lavorative'],
 secret:['Configurazione personalizzata','Quote per grandi volumi','Integrazioni dedicate','Accordi di supporto su misura','Attivazione entro 24 ore lavorative']};
let annual=false;
function drawPlans(){
 $('#plan-cards').innerHTML=[...Object.keys(plans),'secret'].map(id=>{const p=plans[id];return `<article class="plan ${id==='vip'?'featured':''}">${id==='vip'?'<span class="plan-tag">PIÙ SCELTO</span>':''}${icon(symbols[id],'plan-symbol')}<h3>${p?.name.toUpperCase()||'SECRET PLAN'}</h3><p class="plan-description">${descriptions[id]}</p><p class="price"><strong>${p?euro(annual&&p.annual?p.annual:p.monthly):'Su preventivo'}</strong>${p?` <small>/${annual&&p.annual?'anno':'mese'}</small>`:''}</p><p class="annual-note">${p?.annual?(annual?`${euro(p.annual/12,2)}/mese equivalenti · pagamento annuale`:`${euro(p.annual)}/anno con l’annuale`):id==='secret'?'Un piano disegnato sulla tua rete':'Fatturazione mensile'}</p><${id==='secret'?'button':'a'} ${id==='secret'?'type="button" data-contact':'href="#inizia"'} class="button ${id==='vip'?'primary':''}">${id==='secret'?'Richiedi informazioni':'Scopri come iniziare'}</${id==='secret'?'button':'a'}><ul>${benefits[id].map(t=>`<li>${icon('check')}<span>${t}</span></li>`).join('')}</ul></article>`;}).join('');
 $('[data-contact]').onclick=()=>openAccount('contact');
}
document.querySelectorAll('[name=billing]').forEach(x=>x.onchange=()=>{annual=x.value==='annual';drawPlans();});drawPlans();
const yes=true,no=false,all=[yes,yes,yes,yes],pro=[no,yes,yes,yes],ai=[no,no,yes,yes];
const rows=[
 ['category','Persone, assistenza e quote mensili'],
 ['users','Agenti umani inclusi',['2','10','Illimitati','Illimitati']],
 ['users','Ogni agente umano extra / mese',['50 €','25 €','Incluso','Incluso']],
 ['mail','Supporto',['Solo email','Solo email','Email + WhatsApp prioritario','Email + WhatsApp prioritario']],
 ['sparkles','Agenti AI inclusi',[no,no,'1','2']],
 ['sparkles','Ogni agente AI extra / mese',[no,no,'100 €','50 €']],
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
];
$('#comparison').innerHTML=rows.map(([name,label,values])=>name==='category'?`<tr class="category"><th colspan="6">${label}</th></tr>`:`<tr><th scope="row"><span class="row-label">${icon(name)}${label}</span></th>${values.map(v=>`<td>${v===true?`${icon('check')}<span class="sr-only">Incluso</span>`:v===false?`${icon('minus')}<span class="sr-only">Non incluso</span>`:v}</td>`).join('')}<td>Su preventivo</td></tr>`).join('');
const labels={minutes:'Minuti di conversazioni AI',simple:'Operazioni semplici',medium:'Indagini Detective medie',complex:'Indagini Detective complesse'};
const maxes={minutes:20000,simple:3000,medium:1000,complex:500};
const defaults={minutes:1238,simple:225,medium:50,complex:20};
let rates={...customerRates};
$('#usage-controls').innerHTML=usageKeys.map(k=>`<div class="usage-row"><div><label for="${k}">${labels[k]} / mese</label><input id="${k}" type="number" min="0" max="10000000" step="1" required value="${defaults[k]}" aria-label="${labels[k]} al mese"></div><input id="${k}-range" type="range" min="0" max="${maxes[k]}" step="1" value="${defaults[k]}" aria-label="Regola ${labels[k].toLowerCase()}"></div>`).join('');
function drawEstimate(){
 if(!$('#usage-form').checkValidity())return;
 const usage=Object.fromEntries(usageKeys.map(k=>[k,Number($('#'+k).value)])),agents=Number($('#ai-agents').value);
 const results={vip:estimate('vip',agents,usage,rates),elite:estimate('elite',agents,usage,rates)};
 const complete=results.vip.total!==null&&results.elite.total!==null;
 const winner=complete?(results.vip.total<=results.elite.total?'vip':'elite'):null;
 $('#ai-minus').disabled=agents<=1;$('#ai-plus').disabled=agents>=1000;
 $('#estimate-cards').innerHTML=['vip','elite'].map(id=>{const r=results[id];return `<article class="estimate ${winner===id?'winner':''}"><h3>${icon(symbols[id])}${plans[id].name}</h3><p class="price"><strong>${euro(r.total??r.subtotal)}</strong> <small>/mese${r.total===null?' + consumi':''}</small></p><dl><dt>Canone mensile</dt><dd>${euro(r.base)}</dd><dt>Agenti AI extra (${Math.max(0,agents-plans[id].ai)})</dt><dd>${euro(r.extraAgents)}</dd><dt>Consumi oltre quota</dt><dd>${r.consumption===null?'Da quantificare':euro(r.consumption,2)}</dd>${r.extras.filter(x=>x.units>0).map(x=>`<dt>${labels[x.key]}</dt><dd>+${integer(x.units)}</dd>`).join('')}</dl><a href="#inizia" class="button ${winner===id?'primary':''}">Come attivare ${plans[id].name} ↗</a></article>`;}).join('');
 const diff=complete?Math.abs(results.vip.total-results.elite.total):null;
 $('#savings').textContent=complete?(diff===0?'Stesso totale mensile con entrambi i piani.':`Con ${plans[winner].name} risparmi ${euro(diff,2)} al mese rispetto a ${plans[winner==='vip'?'elite':'vip'].name}.`):'Quote superate: il totale dei consumi e il risparmio richiedono le tariffe extra confermate.';
 $('#rates').innerHTML=usageKeys.map(k=>`<div class="rate-row"><span>${k==='minutes'?'Chiamata AI extra · voce + elaborazione AI':labels[k]}</span><strong>${new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR',minimumFractionDigits:2,maximumFractionDigits:5}).format(rates[k])} / ${k==='minutes'?'min':'operazione'}</strong></div>`).join('');
}
usageKeys.forEach(k=>{$('#'+k).addEventListener('input',()=>{if($('#'+k).checkValidity()){$('#'+k+'-range').max=Math.max(maxes[k],Number($('#'+k).value));$('#'+k+'-range').value=$('#'+k).value;}drawEstimate();});$('#'+k+'-range').addEventListener('input',()=>{$('#'+k).value=$('#'+k+'-range').value;drawEstimate();});});
$('#ai-agents').addEventListener('input',drawEstimate);
$('#ai-minus').onclick=()=>{$('#ai-agents').stepDown();drawEstimate();};$('#ai-plus').onclick=()=>{$('#ai-agents').stepUp();drawEstimate();};$('#usage-form').onsubmit=e=>e.preventDefault();drawEstimate();
fetch('/api/public/pricing').then(r=>r.ok?r.json():{}).then(data=>{rates={...customerRates,...data.overage};drawEstimate();}).catch(()=>{});
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
 $('#account-content').innerHTML=`<p class="eyebrow">LA TUA AGENZIA</p><h2 id="account-title">${esc(me.tenant)}</h2><div class="account-status"><strong>${status.kyb==='approved'?'Verifica aziendale approvata':'Verifica aziendale da completare'}</strong><p>${status.kyb==='approved'?'Puoi ora scegliere il piano della tua agenzia.':'L’account è stato creato. La scelta del piano e il pagamento rimangono bloccati fino all’approvazione KYB.'}</p></div><div id="billing-actions"></div><p class="message" id="account-message" role="status"></p><div class="dialog-actions"><a class="button quiet" href="/app">Apri gestionale</a><button id="signout" class="text-button">Esci</button></div>`;
 $('#signout').onclick=async()=>{await api('/api/logout',{});me=null;await openAccount('login');};
 const quoteButton=document.createElement('button');quoteButton.className='text-button';quoteButton.textContent='Richiedi preventivo Secret Plan';quoteButton.onclick=()=>{
  $('#billing-actions').innerHTML='<form id="quote-form"><label>Raccontaci la tua rete<textarea name="message" rows="4" minlength="10" maxlength="3000" required placeholder="Numero sedi, volumi e integrazioni richieste"></textarea></label><button class="button primary" type="submit">Salva richiesta di preventivo</button></form>';
  $('#quote-form').onsubmit=async e=>{e.preventDefault();const b=e.target.querySelector('button');b.disabled=true;try{await api('/api/billing/enquiry',Object.fromEntries(new FormData(e.target)));$('#account-message').textContent='Richiesta salvata e associata alla tua agenzia. Nessun acquisto effettuato.';}catch(error){$('#account-message').textContent=error.message;}finally{b.disabled=false;}};
 };$('#account-content .dialog-actions').append(quoteButton);
 try{
  const usage=await api('/api/billing/usage'),section=document.createElement('section');section.className='usage-account';
  const date=v=>new Date(v).toLocaleDateString('it-IT');
  section.innerHTML=`<h3>I consumi della tua agenzia</h3><p class="fineprint">Ciclo ${date(usage.cycle.start)} – ${date(usage.cycle.end)}. Rinnovo automatico delle quote alla fine del ciclo.</p>${usage.lines.map(line=>`<div class="usage-account-row"><strong>${labels[line.kind]}</strong><span>${integer(line.used)} / ${integer(line.included)}</span><small>Extra: ${integer(line.extra)} · ${euro(line.extraEur,2)}</small></div>`).join('')}<p><strong>Totale consumi extra: ${euro(usage.totalExtraEur,2)}</strong></p><details><summary>Ultimi consumi del ciclo</summary>${usage.events.map(event=>`<p class="fineprint">${date(event.date)} · ${esc(event.agentId)} · ${labels[event.kind]} · ${event.units}</p>`).join('')||'<p class="fineprint">Nessun consumo registrato.</p>'}</details>`;
  $('#account-content').append(section);
 }catch(error){if(!/abbonamento AI attivo/.test(error.message))console.warn('Riepilogo consumi non disponibile');}
 if(status.kyb!=='approved'){
  $('#billing-actions').innerHTML='<button id="start-kyb" class="button primary">Avvia verifica aziendale</button>';
  $('#start-kyb').onclick=async()=>{try{const data=await api('/api/billing/kyb',{});location.assign(data.url);}catch(error){$('#account-message').textContent=error.message;}};
 }else{
  $('#billing-actions').innerHTML='<form id="checkout-form"><label>Piano<select id="checkout-plan"><option value="standard">Standard · 53 €/mese</option><option value="pro">Pro · 105 €/mese</option><option value="vip">VIP · 522 €/mese</option><option value="elite">Elite · 1.045 €/mese</option><option value="secret">Secret Plan · su preventivo</option></select></label><label>Fatturazione<select id="checkout-cycle"><option value="monthly">Mensile</option><option value="annual">Annuale</option></select></label><label id="human-count-label">Agenti umani totali<input id="checkout-humans" type="number" min="1" max="1000" step="1" value="2" required></label><label id="ai-count-label" hidden>Agenti AI totali<input id="checkout-ai" type="number" min="1" max="1000" step="1" value="1"></label><p class="fineprint" id="checkout-summary"></p><button type="submit" class="button primary">Continua al pagamento</button></form>';
  const syncCheckout=()=>{const id=$('#checkout-plan').value,p=plans[id],isAI=!!p?.ai;$('#human-count-label').hidden=isAI||id==='secret';$('#ai-count-label').hidden=!isAI;$('#checkout-humans').disabled=isAI||id==='secret';$('#checkout-ai').disabled=!isAI;$('#checkout-cycle').disabled=!p?.annual;if(!p?.annual)$('#checkout-cycle').value='monthly';const yearly=$('#checkout-cycle').value==='annual';const extra=p?.humans?Math.max(0,Number($('#checkout-humans').value)-p.humans)*p.humanExtra:isAI?Math.max(0,Number($('#checkout-ai').value)-p.ai)*p.aiExtra:0;$('#checkout-summary').textContent=p?`Canone: ${euro(yearly?p.annual:p.monthly)}/${yearly?'anno':'mese'}. Agenti extra: ${euro(extra)}/mese.`:'Preventivo personalizzato richiesto prima del pagamento.';$('#checkout-form button[type=submit]').textContent=id==='secret'?'Richiedi preventivo':'Continua al pagamento';};
  ['checkout-plan','checkout-cycle','checkout-humans','checkout-ai'].forEach(id=>$('#'+id).oninput=syncCheckout);syncCheckout();
  $('#checkout-form').onsubmit=async e=>{e.preventDefault();const b=e.target.querySelector('button[type=submit]');b.disabled=true;try{const data=await api('/api/billing/checkout',{plan:$('#checkout-plan').value,cycle:$('#checkout-cycle').value,humans:Number($('#checkout-humans').value),ai:Number($('#checkout-ai').value)});location.assign(data.url);}catch(error){$('#account-message').textContent=error.message;b.disabled=false;}};
 }
}
document.querySelectorAll('[data-auth]').forEach(b=>b.onclick=()=>openAccount(b.dataset.auth));
