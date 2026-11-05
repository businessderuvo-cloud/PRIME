export const developmentStatusKey=title=>title.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');

export function applyDevelopmentOverrides(sections,overrides=[]){
  const saved=new Map(overrides.map(override=>[override.feature_key,override]));
  return sections.map(section=>({...section,items:section.items.map(item=>{
    const key=developmentStatusKey(item.title),override=saved.get(key);
    return {...item,key,automaticDone:item.done,manual:!!override,done:override?override.status==='done':item.done,note:override?.note||'',updatedAt:override?.updated_at||''};
  })}));
}

export function developmentSections({edition,connect=null,telephony=null,voice=null,stripe=null}){
  const sections=[{title:'Gestionale · codice disponibile',items:[
    {title:'CRM, immobili, territorio e agenda',done:true,detail:'Moduli presenti nel gestionale; questa voce indica la disponibilità del codice, non un collaudo completo di ogni flusso.'},
    {title:'Separazione agenzie, ruoli e dati demo',done:true,detail:'Controlli server e database separato per la demo.'},
    {title:'Collaudo completo con i tuoi account',done:false,detail:'Da completare sulle integrazioni reali, senza inviare messaggi o avviare chiamate di prova automaticamente.'}
  ]}];
  if(edition==='base')return sections;
  const connections=connect?.connections||[];
  const providers=[...(connect?.providers||[]),...(connect?.mailProviders||[])];
  const configured=id=>providers.some(provider=>provider.provider===id&&provider.configured);
  const linked=id=>connections.some(connection=>connection.provider===id&&connection.status==='connected');
  sections.push({title:'Email e calendari · account effettivamente collegati',items:[
    ...[['gmail','Gmail'],['outlook','Outlook'],['infomaniak','Infomaniak'],['zoho','Zoho Mail'],['infocert','InfoCert PEC'],['google','Google Calendar'],['apple','iCloud'],['calendly','Calendly']].map(([id,title])=>({title,done:linked(id),detail:linked(id)?'Account autorizzato in questo workspace.':connect===null?'Stato non verificabile: riprova o controlla i permessi.':configured(id)?'Configurazione presente: manca l’autorizzazione personale.':'Da configurare e autorizzare in PRIME Connect o Email.'})),
    {title:'Flusso OAuth Calendly dell’agenzia',done:true,detail:'Configurazione guidata e collegamento del proprio account ripristinati. Il verde riguarda il flusso, non l’account.'},
    {title:'Outlook tramite collegamento server esterno',done:false,detail:'Da configurare e verificare. Lo switch Email normale / PEC è disponibile, ma non attiva un servizio PEC.'}
  ]});
  if(['vip','elite'].includes(edition))sections.push({title:'Voce e telefonia · verifiche reali',items:[
    ...[['telnyx','Telnyx']].map(([id,title])=>{const provider=telephony?.providers?.find(item=>item.provider===id);return {title,done:!!(provider?.configured&&provider.verified_at&&!provider.demo&&!telephony.demo),detail:provider?.configured&&!provider.demo&&!telephony.demo?'Accesso API verificato. Il collegamento non avvia chiamate.':telephony===null?'Stato non verificabile: controlla accesso e piano.':'Inserisci le credenziali e verifica il numero in PRIME Connect.'};}),
    {title:'Credenziali Vanessa / ElevenLabs',done:!!voice?.configured,detail:voice?.configured?'Credenziali presenti sul server. Le chiamate e il copilot richiedono un collaudo separato.':'Credenziali non presenti o stato non verificabile.'},
    {title:'Trunk vocale Telnyx–ElevenLabs',done:false,detail:'Da configurare e collaudare separatamente; la verifica API Telnyx non crea un trunk.'},
    {title:'Rimozione CloudTalk',done:true,detail:'Provider rimosso dalla configurazione; la migrazione rimuove le vecchie credenziali telefoniche obsolete.'},
    {title:'Dati Wallester della demo',done:false,detail:'Restano intenzionalmente fittizi. Le operazioni finanziarie reali non sono attive nella demo locale.'}
  ]});
  if(edition==='elite')sections.push({title:'Incassi e pagamenti · Stripe',items:[
    {title:'Stripe',done:stripe?.configured===true,detail:stripe?.configured?'Account collegato e confermato da Stripe.':stripe?.pending?'Collegamento iniziato: completa la verifica su Stripe.':stripe?.platformConfigured?'Manca il collegamento dell’account Stripe in PRIME Connect.':'Configura Stripe Connect sul server, poi collega l’account in PRIME Connect.'},
    {title:'Webhook Stripe',done:stripe?.webhookConfigured===true,detail:stripe?.webhookConfigured?'Configurazione webhook presente; gli eventi devono essere verificati con firma Stripe.':'Webhook da configurare e collaudare per aggiornare gli stati dei pagamenti.'}
  ]});
  return sections;
}

export async function renderDevelopmentStatus({main,state,api,pageHeader,esc}){
  main.innerHTML=pageHeader('TRASPARENZA SUL PRODOTTO','Stato sviluppo','Controlli automatici e aggiornamenti manuali del workspace.')+'<p role="status">Controllo lo stato delle integrazioni…</p>';
  const loading=main.querySelector('[role="status"]');
  const read=path=>api(path).catch(()=>null);
  const advanced=['vip','elite'].includes(state.me.edition);
  const [connect,telephony,voice,manualStatus,stripe]=await Promise.all([state.me.edition==='base'?null:read('/api/connect'),advanced?read('/api/connect/telephony'):null,advanced?read('/api/elite/status'):null,read('/api/development-status'),state.me.stripe_enabled?read('/api/stripe/status?mode='+(state.stripeMode||'test')):null]);
  if(!loading.isConnected)return;
  const releases=await fetch('/assets/development-releases.txt',{cache:'no-store'}).then(response=>response.ok?response.json():[]).catch(()=>[]);
  if(!loading.isConnected)return;
  const automatic=developmentSections({edition:state.me.edition,connect,telephony,voice,stripe});
  let overrides=manualStatus?.overrides||[];
  const canEdit=!!manualStatus?.can_edit;
  main.innerHTML=pageHeader('TRASPARENZA SUL PRODOTTO','Stato sviluppo','Puoi impostare manualmente una spunta verde o una X rossa e aggiungere note. La modifica non collega account né attiva servizi: la verifica automatica rimane visibile.')+`<div class="development-summary"><span class="development-done" data-development-done></span><span class="development-missing" data-development-missing></span><button type="button" class="secondary" data-development-refresh>Aggiorna stato</button></div><p class="small-note">${state.me.customer_demo?'Nella demo le modifiche restano nella sessione temporanea corrente.':'Le modifiche sono salvate per questo workspace e condivise con il team.'}</p><p role="status" data-development-feedback>${manualStatus?'':'Impossibile leggere gli aggiornamenti manuali. Riprova con Aggiorna stato.'}</p><section class="panel development-filters"><label>Cerca funzionalità<input type="search" data-development-search placeholder="Gmail, Calendly, telefonia…"></label><label>Mostra<select data-development-filter><option value="all">Tutto</option><option value="done">✓ Completato / presente</option><option value="missing">✕ Da completare / verificare</option></select></label></section><div data-development-sections></div>`;
  if(Array.isArray(releases)&&releases.length){
    const history=document.createElement('section');
    history.className='panel development-section';
    const date=new Intl.DateTimeFormat('it-IT',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Rome'});
    history.innerHTML='<h2>Ultimi aggiornamenti pubblicati</h2><p class="small-note">Il registro si aggiorna a ogni pubblicazione di PRIME.</p><ul>'+releases.slice(0,8).map(release=>'<li><div class="development-item-content"><h3>'+esc(date.format(new Date(release.date)))+'</h3><p>'+esc(release.note)+'</p></div></li>').join('')+'</ul>';
    main.querySelector('.development-summary').after(history);
  }
  const search=main.querySelector('[data-development-search]'),filter=main.querySelector('[data-development-filter]'),target=main.querySelector('[data-development-sections]'),feedback=main.querySelector('[data-development-feedback]');
  function draw(){
    const sections=applyDevelopmentOverrides(automatic,overrides);
    const items=sections.flatMap(section=>section.items),done=items.filter(item=>item.done).length;
    main.querySelector('[data-development-done]').textContent='✓ '+done+' condizioni soddisfatte';
    main.querySelector('[data-development-missing]').textContent='✕ '+(items.length-done)+' da completare o verificare';
    const query=search.value.trim().toLocaleLowerCase('it');
    target.innerHTML=sections.map(section=>{
      const visible=section.items.filter(item=>(filter.value==='all'||item.done===(filter.value==='done'))&&[section.title,item.title,item.detail,item.note].join(' ').toLocaleLowerCase('it').includes(query));
      return visible.length?`<section class="panel development-section"><h2>${esc(section.title)}</h2><ul>${visible.map(item=>`<li data-development-item="${item.key}"><span class="development-mark ${item.done?'development-done':'development-missing'}" aria-label="${item.done?'Condizione soddisfatta':'Da completare o verificare'}">${item.done?'✓':'✕'}</span><div class="development-item-content"><h3>${esc(item.title)}</h3><p>${esc(item.detail)}</p>${item.manual?`<span class="pill">Impostato manualmente</span><p class="small-note">Verifica automatica: ${item.automaticDone?'✓ condizione soddisfatta':'✕ da completare o verificare'}</p>${item.note?`<p class="development-note">${esc(item.note)}</p>`:''}`:''}${canEdit?`<details class="development-editor"><summary>Modifica stato · ${esc(item.title)}</summary><form data-development-edit="${item.key}"><label>Stato<select name="status"><option value="auto" ${!item.manual?'selected':''}>Automatico</option><option value="done" ${item.manual&&item.done?'selected':''}>✓ Completato</option><option value="missing" ${item.manual&&!item.done?'selected':''}>✕ Da completare</option></select></label><label>Nota<textarea name="note" rows="3" maxlength="2000" placeholder="Che cosa è stato fatto o che cosa manca?">${esc(item.note)}</textarea></label><p class="small-note">Scegli Automatico per eliminare la modifica manuale e la nota.</p><button type="submit" class="primary">Salva stato</button><p role="status"></p></form></details>`:''}</div></li>`).join('')}</ul></section>`:'';
    }).join('')||'<p role="status">Nessuna funzionalità corrispondente ai filtri.</p>';
    target.querySelectorAll('[data-development-edit]').forEach(form=>form.onsubmit=async event=>{
      event.preventDefault();
      const button=form.querySelector('button'),message=form.querySelector('[role="status"]');
      button.disabled=true;message.textContent='Salvataggio…';
      const featureKey=form.dataset.developmentEdit;
      try{
        const body={feature_key:featureKey,...Object.fromEntries(new FormData(form))};
        const result=await api('/api/development-status',{method:'PUT',body:JSON.stringify(body)});
        overrides=overrides.filter(override=>override.feature_key!==featureKey);
        if(result.override)overrides.push(result.override);
        draw();feedback.textContent=body.status==='auto'?'Stato automatico ripristinato.':'Stato manuale e nota salvati.';
      }catch(error){message.textContent=error.message;button.disabled=false;}
    });
  }
  search.oninput=draw;filter.onchange=draw;
  main.querySelector('[data-development-refresh]').onclick=()=>renderDevelopmentStatus({main,state,api,pageHeader,esc});
  draw();
}
