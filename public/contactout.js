const brand = (name, file, showLabel = true) => `<span class="integration-brand-icon" aria-hidden="true"><img src="/brands/providers/${file}" alt="" width="28" height="28"></span>${showLabel ? `<span>${name}</span>` : ''}`;

export async function renderContactOutSettings({ main, state, api, esc, navigate }) {
  const panel = document.createElement('section');
  panel.className = 'panel datagma-panel contactout-panel';
  panel.innerHTML = `<p class="eyebrow">ARRICCHIMENTO CRM</p><h2 class="provider-brand-title">${brand('ContactOut', 'contactout.png')}</h2><p>Trova email, telefoni e dati professionali a partire da un’email, un numero o un profilo LinkedIn già salvato nel CRM. Ogni ricerca parte dalla scheda della persona e può consumare crediti ContactOut.</p><span class="pill" data-contactout-state>Controllo del collegamento…</span><div data-contactout-settings></div><p class="connect-feedback" data-contactout-feedback role="status" aria-live="polite"></p>`;
  const external = document.createElement('section');
  external.className = 'panel datagma-panel';
  const whuisPlan = state.me.customer_demo ? state.me.demo_plan : state.me.edition;
  const whuisLogo = ['vip','elite','secret'].includes(whuisPlan) ? 'whuis-dark.png' : 'whuis.png';
  external.innerHTML = `<p class="eyebrow">SERVIZI ESTERNI</p><h2>Ricerche su persone e immobili</h2><div class="external-service-grid"><article><h3 class="provider-brand-title">${brand('Telecontact', 'telecontact.png')}</h3><p>Consulta il servizio per le tue ricerche su proprietari e recapiti.</p><a class="secondary" href="https://telecontact.it/" target="_blank" rel="noopener noreferrer">Apri Telecontact ↗</a></article><article><h3 class="provider-brand-title">${brand('WHUIS', whuisLogo, false)}</h3><p>Accedi alle ricerche e ai documenti del tuo account WHUIS.</p><a class="secondary" href="https://app.whuis.com/login" target="_blank" rel="noopener noreferrer">Apri WHUIS ↗</a></article></div><p class="small-note">I servizi si aprono sui rispettivi siti. PRIME non invia dati del CRM e non importa risultati da questi collegamenti.</p>`;
  main.append(panel, external);
  const status = panel.querySelector('[data-contactout-feedback]');
  const badge = panel.querySelector('[data-contactout-state]');
  try {
    let cfg = await api('/api/contactout/settings');
    if (!panel.isConnected) return;
    const admin = !state.me.customer_demo && ['owner', 'manager'].includes(state.me.role);
    const target = panel.querySelector('[data-contactout-settings]');
    const draw = () => { state.contactoutConfigured=cfg.configured===true && cfg.mode==='live';
      const nav = document.querySelector('.sidebar nav'), existingNavItem = nav?.querySelector('[data-page="contactout"]');
      if (state.contactoutConfigured && nav && !existingNavItem) {
        const item = document.createElement('button');
        item.type = 'button'; item.className = 'nav-item'; item.dataset.page = 'contactout';
        item.innerHTML = '<img src="/brands/providers/contactout.png" alt="" aria-hidden="true" width="24" height="22" style="width:24px;height:22px;object-fit:contain;flex:0 0 24px;filter:none"><span>ContactOut · Ricerche</span>';
        item.onclick = () => navigate?.('contactout');
        nav.querySelector('[data-page="connect"]')?.after(item);
      } else if (!state.contactoutConfigured) existingNavItem?.remove();
      badge.textContent = cfg.configured ? (cfg.mode === 'test' ? 'API di test collegata · risultati campione' : 'Token API verificato') : 'Da configurare';
      target.innerHTML = admin ? `<details ${cfg.configured ? '' : 'open'}><summary>Configura API ContactOut</summary><ol class="namirial-steps"><li>Richiedi l’accesso API dal tuo account ContactOut o contatta il loro reparto commerciale.</li><li>Ottieni il token e verifica che il piano includa l’arricchimento dei contatti.</li><li>Inserisci la chiave qui sotto. PRIME ne verifica l’accesso alle statistiche prima di salvarla cifrata.</li><li>Apri una persona nel CRM, scegli il dato da usare e premi “Cerca con ContactOut”.</li></ol><div class="connect-actions"><a href="https://contactout.com/meeting?utm_source=api_docs" target="_blank" rel="noopener noreferrer">Richiedi accesso API ↗</a><a href="https://contactout.com/api_docs/" target="_blank" rel="noopener noreferrer">Documentazione ufficiale ↗</a></div><form class="connect-form" data-contactout-config><label>Token API ${cfg.token_set ? '· già salvato, lascia vuoto per mantenerlo' : ''}<input name="api_token" type="password" autocomplete="new-password" data-no-voice="true" maxlength="8192" ${cfg.token_set ? '' : 'required'} placeholder="Incolla il token ContactOut"></label><button class="primary" type="submit">Verifica e salva ContactOut</button></form></details>${cfg.configured ? '<button type="button" class="text-button" data-contactout-remove>Rimuovi chiave ContactOut</button>' : ''}` : cfg.mode === 'test' ? '<p class="small-note">Modalità campione disponibile dal CRM.</p>' : '<p class="small-note">Il titolare o il responsabile configura la chiave dell’agenzia. Ogni utente può poi avviare le ricerche dalle schede CRM.</p>';
      if(cfg.configured && cfg.mode==='live'){target.insertAdjacentHTML('beforeend','<div class="datagma-tools-entry"><button type="button" class="secondary" data-open-contactout>Apri area ricerche ContactOut</button></div>');target.querySelector('[data-open-contactout]').onclick=()=>navigate?.('contactout');}
      if (admin && !state.me.customer_demo) {
        target.insertAdjacentHTML('beforeend', '<button type="button" class="secondary" data-contactout-test>Collega API di test ContactOut</button><p class="small-note">La modalità test usa la chiave campione ContactOut e invia esclusivamente un profilo dimostrativo. I risultati non possono essere inseriti nel CRM.</p>');
        target.querySelector('[data-contactout-test]').onclick = async (event) => {
          event.currentTarget.disabled = true;
          try { cfg = await api('/api/contactout/settings', { method: 'PUT', body: JSON.stringify({ mode: 'test' }) }); draw(); status.textContent = 'API di test verificata e collegata. Le ricerche restituiscono risultati campione.'; }
          catch (error) { status.textContent = error.message; event.currentTarget.disabled = false; }
        };
      }
      target.querySelector('form')?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const form = event.currentTarget, button = form.querySelector('button'), field = form.elements.api_token;
        button.disabled = true;
        status.textContent = 'Verifica del token ContactOut…';
        try {
          cfg = await api('/api/contactout/settings', { method: 'PUT', body: JSON.stringify({ api_token: field.value.trim() }) });
          if (!panel.isConnected) return;
          draw();
          status.textContent = 'Token verificato e salvato cifrato. Puoi avviare le ricerche dal CRM.';
        } catch (error) { status.textContent = error.message; }
        finally { field.value = ''; button.disabled = false; }
      });
      target.querySelector('[data-contactout-remove]')?.addEventListener('click', async (event) => {
        event.currentTarget.disabled = true;
        try {
          await api('/api/contactout/settings', { method: 'DELETE' });
          cfg = { configured: false, token_set: false };
          if (panel.isConnected) { draw(); status.textContent = 'Chiave rimossa. Le nuove ricerche ContactOut sono disabilitate.'; }
        } catch (error) { status.textContent = error.message; event.currentTarget.disabled = false; }
      });
    };
    draw();
  } catch (error) { badge.textContent = 'Stato non disponibile'; status.textContent = error.message; }
}

export function mountContactOutEnrichment({ dialog, record, methods, api, esc }) {
  const identifiers = [];
  if (record.email) identifiers.push(['email', 'Email · ' + record.email]);
  if (methods.some((item) => item.method_type === 'LinkedIn')) identifiers.push(['linkedin', 'Profilo LinkedIn salvato']);
  if (record.phone) identifiers.push(['phone', 'Telefono · ' + record.phone]);
  const panel = document.createElement('section');
  panel.className = 'panel datagma-enrichment contactout-enrichment';
  panel.innerHTML = `<h3 class="provider-brand-title">${brand('Cerca con ContactOut', 'contactout.png')}</h3><p class="small-note">Usa un dato salvato per trovare il profilo e altri recapiti. La ricerca può consumare crediti. Verifica che il risultato corrisponda alla persona prima di inserirlo.</p>${identifiers.length ? `<label class="contactout-identifier">Cerca utilizzando<select data-contactout-identifier>${identifiers.map(([value, label]) => `<option value="${value}">${esc(label)}</option>`).join('')}</select></label>` : '<p class="small-note">Salva prima un’email, un telefono o un profilo LinkedIn nella scheda.</p>'}<label class="checkbox-label"><input type="checkbox" data-contactout-consent>Invia il dato selezionato a ContactOut per questa ricerca.</label><button type="button" class="secondary" data-contactout-run disabled>Cerca con ContactOut</button><p class="small-note" role="status" aria-live="polite" data-contactout-status>Controllo della configurazione…</p><div data-contactout-results></div>`;
  dialog.querySelector('.dialog-body').append(panel);
  const button = panel.querySelector('[data-contactout-run]');
  const status = panel.querySelector('[data-contactout-status]');
  const results = panel.querySelector('[data-contactout-results]');
  let configured = false, busy = false;
  const unavailable = () => !configured || !identifiers.length || !!record.do_not_contact;
  api('/api/contactout/settings').then((cfg) => {
    if (!panel.isConnected) return;
    configured = cfg.configured;
    if (cfg.mode === 'test') panel.querySelector('h3').insertAdjacentHTML('afterend', '<p class="small-note">API di test ContactOut: viene inviato solo un identificativo dimostrativo. I risultati sono campioni e non corrispondono alla persona nel CRM.</p>');
    button.disabled = unavailable();
    status.textContent = record.do_not_contact ? 'Ricerca disabilitata: il contatto ha chiesto di non essere ricontattato.' : !configured ? 'Configura prima la chiave API ContactOut in PRIME Connect.' : '';
  }).catch((error) => { status.textContent = error.message; });
  button.onclick = async () => {
    if (busy || unavailable()) return;
    if (!panel.querySelector('[data-contactout-consent]').checked) { status.textContent = 'Conferma l’invio del dato selezionato a ContactOut.'; return; }
    busy = true; button.disabled = true;
    results.replaceChildren();
    status.textContent = 'Ricerca ContactOut in corso…';
    try {
      const result = await api('/api/contactout/enrich', { method: 'POST', body: JSON.stringify({ contact_id: record.id, identifier: panel.querySelector('[data-contactout-identifier]').value, consent: true }) });
      if (!panel.isConnected) return;
      if (!result.found) { status.textContent = 'Nessun risultato trovato da ContactOut.'; return; }
      const candidate = result.candidate;
      status.textContent = result.test_mode ? 'Risultato campione ContactOut. Nessun dato della persona è stato inviato e il campione non viene inserito nel CRM.' : `Profilo trovato${candidate.name ? ': ' + candidate.name : ''}. Controlla i dati, scegli cosa inserire e poi salva la scheda.`;
      const suggestions = [
        ...(candidate.profession ? [{ field: 'profession', label: 'Professione', value: candidate.profession }] : []),
        ...candidate.emails.map((item) => ({ field: 'email', label: item.kind, value: item.value })),
        ...candidate.phones.map((value) => ({ field: 'phone', label: 'Telefono · tipo da verificare', value })),
        ...(candidate.linkedin ? [{ field: 'linkedin', label: 'LinkedIn', value: candidate.linkedin }] : []),
      ];
      results.innerHTML = suggestions.map((item, index) => `<div class="datagma-result-row"><span><strong>${esc(item.label)}</strong><small>${esc(item.value)}</small></span><div class="connect-actions"><button type="button" class="text-button" data-contactout-copy="${index}">Copia</button><button type="button" class="text-button" data-contactout-apply="${index}">Inserisci</button></div></div>`).join('');
      if (result.test_mode) results.querySelectorAll('[data-contactout-apply]').forEach((button) => button.remove());
      results.querySelectorAll('[data-contactout-copy]').forEach((copy) => { copy.onclick = async () => {
        try { await navigator.clipboard.writeText(suggestions[Number(copy.dataset.contactoutCopy)].value); status.textContent = 'Dato copiato.'; }
        catch { status.textContent = 'Copia il dato mostrato nella riga.'; }
      }; });
      results.querySelectorAll('[data-contactout-apply]').forEach((apply) => { apply.onclick = () => {
        const item = suggestions[Number(apply.dataset.contactoutApply)];
        if (item.field === 'profession' || item.field === 'email') {
          const input = dialog.querySelector(`[name="${item.field}"]`);
          if (input.value.trim()) { status.textContent = 'Il campo contiene già un valore. Copia il dato per modificarlo manualmente.'; return; }
          input.value = item.value;
        } else if (item.field === 'phone') {
          const input = dialog.querySelector('[name="phone"]');
          const phoneSection = dialog.querySelector('[data-add-phone]').closest('section');
          const existing = [input.value, ...[...phoneSection.querySelectorAll('[data-recap-value]')].map((field) => field.value)];
          const digits = (value) => value.replace(/\D/g, '');
          if (existing.some((value) => digits(value) === digits(item.value))) { status.textContent = 'Questo numero è già presente nella scheda.'; return; }
          if (!input.value.trim()) {
            input.value = item.value;
            dialog.querySelector('[name="phone_kind"]').value = '';
          } else {
            dialog.querySelector('[data-add-phone]').click();
            const phoneRow = dialog.querySelector('[data-add-phone]').closest('section').querySelector('[data-recap-rows]').lastElementChild;
            if (!phoneRow) return;
            phoneRow.querySelector('[data-recap-value]').value = item.value;
            phoneRow.querySelector('[data-recap-label]').value = 'ContactOut';
          }
        } else if (item.field === 'linkedin') {
          if ([...dialog.querySelectorAll('[data-recap-value]')].some((input) => input.value === item.value)) { status.textContent = 'Questo profilo è già presente.'; return; }
          dialog.querySelector('[data-add-social]').click();
          const row = dialog.querySelector('[data-add-social]').closest('section').querySelector('[data-recap-rows]').lastElementChild;
          row.querySelector('[data-recap-value]').value = item.value;
          row.querySelector('[data-recap-type]').value = 'LinkedIn';
          row.querySelector('[data-recap-label]').value = 'ContactOut';
        }
        apply.disabled = true; apply.textContent = 'Inserito';
        status.textContent = item.field === 'phone' ? 'Numero inserito. Scegli il tipo di numero e salva la scheda.' : 'Dato inserito nel modulo. Premi Salva per registrarlo nel CRM.';
      }; });
    } catch (error) { status.textContent = error.message; }
    finally { busy = false; button.disabled = unavailable(); }
  };
}

export async function renderContactOutPage({main,state,api,esc,pageHeader,navigate}) {
 const cfg=await api('/api/contactout/settings');
 main.innerHTML=pageHeader('CONNESSIONI · CONTACTOUT','ContactOut · Ricerche','Ricerca persone, aziende e recapiti. Consulta i crediti e rivedi i risultati prima di utilizzarli.')+'<section class="panel datagma-panel" data-contactout-tools></section>';
 const host=main.querySelector('[data-contactout-tools]');
 if(!cfg.configured || cfg.mode!=='live'){host.innerHTML='<p>Collega prima la chiave API ContactOut in PRIME Connect.</p><button class="secondary">Apri PRIME Connect</button>';host.querySelector('button').onclick=()=>navigate('connect');return;}
 const operationPaths={"stats":"<path d=\"M6 3h12v18H6zM9 7h6m-6 5h6m-6 5h3\"/>","person":"<circle cx=\"9\" cy=\"8\" r=\"4\"/><path d=\"M2 21c0-8 14-8 14 0m2-12h5m-2.5-2.5v5\"/>","people":"<circle cx=\"8\" cy=\"8\" r=\"3\"/><circle cx=\"17\" cy=\"9\" r=\"3\"/><path d=\"M2 21c0-5 12-5 12 0m1-7c4 0 7 2 7 7\"/>","linkedin":"<rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"3\"/><path d=\"M7 10v7m0-10v.1M11 17v-7m0 3c0-4 6-4 6 0v4\"/>","email":"<rect x=\"2\" y=\"5\" width=\"20\" height=\"14\" rx=\"2\"/><path d=\"m3 6 9 7 9-7\"/>","contacts":"<rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"2\"/><circle cx=\"9\" cy=\"9\" r=\"2\"/><path d=\"M5 17c0-5 8-5 8 0m2-9h3m-3 5h3m-3 4h3\"/>","batch":"<rect x=\"7\" y=\"7\" width=\"14\" height=\"14\" rx=\"2\"/><path d=\"M3 17V3h14m-6 9h6m-6 4h6\"/>","company":"<path d=\"M3 21V7h10v14m0-17h8v17M1 21h22M6 10h4m-4 4h4m-4 4h4m6-10h2m-2 5h2m-2 5h2\"/>","search":"<circle cx=\"10\" cy=\"10\" r=\"7\"/><path d=\"m15 15 7 7\"/>","decision":"<circle cx=\"12\" cy=\"7\" r=\"4\"/><path d=\"M4 21v-3c0-6 16-6 16 0v3m-11-6 3 5 3-5\"/>","check":"<path d=\"M12 2 3 6v6c0 6 9 10 9 10s9-4 9-10V6zM7 12l3 3 7-7\"/>","phone":"<path d=\"M8 3H4c-5 8 9 22 17 17v-4l-5-2-2 3a15 15 0 0 1-7-7l3-2z\"/>"};
 const operationKinds={"stats":"stats","person":"person","linkedin":"linkedin","email":"email","contacts":"contacts","batch":"batch","company":"company","search":"search","count":"people","decision":"decision","companySearch":"company","emailLinkedin":"linkedin","personalCheck":"check","workCheck":"check","phoneCheck":"phone","verify":"check","verifyBatch":"batch"};
 const operationIcon=key=>'<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+operationPaths[operationKinds[key]||'search']+'</svg>';
 const {operations}=await api('/api/contactout/operations');
 const labels={email:'Email',phone:'Telefono',linkedin_url:'URL LinkedIn',full_name:'Nome completo',company:'Azienda',location:'Località',include:'Dati da includere (work_email, personal_email, phone)',profile:'URL profilo LinkedIn',profile_only:'Solo profilo',include_phone:'Includi telefono',email_type:'Tipo email (work, personal, personal,work, none)',profiles:'Profili LinkedIn',domains:'Domini aziendali',domain:'Dominio',name:'Nome',job_title:'Ruolo',page:'Pagina',reveal_info:'Mostra email e telefoni',industry:'Settore',emails:'Email da verificare'};
 host.innerHTML='<div class="contactout-page-brand"><img src="/brands/providers/contactout.png" alt="Logo originale ContactOut" width="56" height="56"><div><p class="eyebrow">CONTACTOUT</p><h2>Ricerche e arricchimento</h2><p class="small-note">Scegli una funzione per aprirne le opzioni.</p></div></div><div class="datagma-operation-grid">'+Object.entries(operations).map(([key,op])=>'<button type="button" class="datagma-operation-card" data-op="'+esc(key)+'" aria-pressed="false"><span class="datagma-operation-icon">'+operationIcon(key)+'</span><span><strong>'+esc(op.title)+'</strong></span></button>').join('')+'</div><div class="datagma-operation-workspace" hidden><h2 data-title></h2><form class="connect-form"><div data-fields></div><label class="checkbox-label"><input type="checkbox" name="confirmed">Confermo l’invio dei dati a ContactOut e il possibile consumo di crediti.</label><button class="primary">Esegui</button></form><p role="status"></p><div data-result></div></div>';
 const workspace=host.querySelector('.datagma-operation-workspace'),form=host.querySelector('form'),fields=host.querySelector('[data-fields]'),status=host.querySelector('[role=status]'),result=host.querySelector('[data-result]');let selected='stats';
 const render=value=>value&&typeof value==='object'?'<dl>'+Object.entries(value).map(([k,v])=>'<dt>'+esc(labels[k]||k)+'</dt><dd>'+render(v)+'</dd>').join('')+'</dl>':esc(String(value??'—'));
 const draw=key=>{selected=key;workspace.hidden=false;host.querySelectorAll('[data-op]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.op===key)));host.querySelector('[data-title]').textContent=operations[key].title;fields.innerHTML=operations[key].fields.map(f=>{const k=f.replace(/\[\]|[?#]/g,'');return '<label>'+esc(labels[k]||k)+(f.endsWith('[]')?'<textarea name="'+k+'"></textarea>':'<input name="'+k+'" type="'+(f.endsWith('?')?'checkbox':f.endsWith('#')?'number':'text')+'">')+'</label>';}).join('');status.textContent='';result.replaceChildren();};
 host.querySelectorAll('[data-op]').forEach(b=>b.onclick=()=>draw(b.dataset.op));
 form.onsubmit=async event=>{event.preventDefault();const operation=selected,params={};for(const f of operations[operation].fields){const k=f.replace(/\[\]|[?#]/g,''),el=form.elements[k];if(f.endsWith('?')){if(el.checked)params[k]=true;}else if(el.value.trim())params[k]=f.endsWith('[]')?el.value.split(/\n/).map(s=>s.trim()).filter(Boolean):f.endsWith('#')?Number(el.value):el.value.trim();}
 const button=form.querySelector('button');button.disabled=true;status.textContent='Richiesta ContactOut in corso…';result.replaceChildren();try{const response=await api('/api/contactout/query',{method:'POST',body:JSON.stringify({operation,params,confirmed:form.elements.confirmed.checked})});result.innerHTML=render(response.result);status.textContent='Risposta ricevuta. Rivedi i dati prima di utilizzarli.';}catch(error){status.textContent=error.message;}finally{button.disabled=false;}};
}
