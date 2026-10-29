const brand = (name, file) => `<span class="integration-brand-icon" aria-hidden="true"><img src="/brands/providers/${file}" alt="" width="28" height="28"></span><span>${name}</span>`;

export async function renderContactOutSettings({ main, state, api, esc }) {
  const panel = document.createElement('section');
  panel.className = 'panel datagma-panel contactout-panel';
  panel.innerHTML = `<p class="eyebrow">ARRICCHIMENTO CRM</p><h2 class="provider-brand-title">${brand('ContactOut', 'contactout.png')}</h2><p>Trova email, telefoni e dati professionali a partire da un’email, un numero o un profilo LinkedIn già salvato nel CRM. Ogni ricerca parte dalla scheda della persona e può consumare crediti ContactOut.</p><span class="pill" data-contactout-state>Controllo del collegamento…</span><div data-contactout-settings></div><p class="connect-feedback" data-contactout-feedback role="status" aria-live="polite"></p>`;
  const external = document.createElement('section');
  external.className = 'panel datagma-panel';
  external.innerHTML = `<p class="eyebrow">SERVIZI ESTERNI</p><h2>Ricerche su persone e immobili</h2><div class="external-service-grid"><article><h3 class="provider-brand-title">${brand('Telecontact', 'telecontact.png')}</h3><p>Consulta il servizio per le tue ricerche su proprietari e recapiti.</p><a class="secondary" href="https://telecontact.it/" target="_blank" rel="noopener noreferrer">Apri Telecontact ↗</a></article><article><h3 class="provider-brand-title">${brand('WHUIS', 'whuis.png?v=official-black')}</h3><p>Accedi alle ricerche e ai documenti del tuo account WHUIS.</p><a class="secondary" href="https://app.whuis.com/login" target="_blank" rel="noopener noreferrer">Apri WHUIS ↗</a></article></div><p class="small-note">I servizi si aprono sui rispettivi siti. PRIME non invia dati del CRM e non importa risultati da questi collegamenti.</p>`;
  main.append(panel, external);
  const status = panel.querySelector('[data-contactout-feedback]');
  const badge = panel.querySelector('[data-contactout-state]');
  try {
    let cfg = await api('/api/contactout/settings');
    if (!panel.isConnected) return;
    const admin = ['owner', 'manager'].includes(state.me.role);
    const target = panel.querySelector('[data-contactout-settings]');
    const draw = () => {
      badge.textContent = cfg.configured ? 'Token API verificato' : 'Da configurare';
      target.innerHTML = admin ? `<details ${cfg.configured ? '' : 'open'}><summary>Configura API ContactOut</summary><ol class="namirial-steps"><li>Richiedi l’accesso API dal tuo account ContactOut o contatta il loro reparto commerciale.</li><li>Ottieni il token e verifica che il piano includa l’arricchimento dei contatti.</li><li>Inserisci la chiave qui sotto. PRIME ne verifica l’accesso alle statistiche prima di salvarla cifrata.</li><li>Apri una persona nel CRM, scegli il dato da usare e premi “Cerca con ContactOut”.</li></ol><div class="connect-actions"><a href="https://contactout.com/meeting?utm_source=api_docs" target="_blank" rel="noopener noreferrer">Richiedi accesso API ↗</a><a href="https://contactout.com/api_docs/" target="_blank" rel="noopener noreferrer">Documentazione ufficiale ↗</a></div><form class="connect-form" data-contactout-config><label>Token API ${cfg.token_set ? '· già salvato, lascia vuoto per mantenerlo' : ''}<input name="api_token" type="password" autocomplete="new-password" data-no-voice="true" maxlength="8192" ${cfg.token_set ? '' : 'required'} placeholder="Incolla il token ContactOut"></label><button class="primary" type="submit">Verifica e salva ContactOut</button></form></details>${cfg.configured ? '<button type="button" class="text-button" data-contactout-remove>Rimuovi chiave ContactOut</button>' : ''}` : '<p class="small-note">Il titolare o il responsabile configura la chiave dell’agenzia. Ogni utente può poi avviare le ricerche dalle schede CRM.</p>';
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
      status.textContent = `Profilo trovato${candidate.name ? ': ' + candidate.name : ''}. Controlla i dati, scegli cosa inserire e poi salva la scheda.`;
      const suggestions = [
        ...(candidate.profession ? [{ field: 'profession', label: 'Professione', value: candidate.profession }] : []),
        ...candidate.emails.map((item) => ({ field: 'email', label: item.kind, value: item.value })),
        ...candidate.phones.map((value) => ({ field: 'phone', label: 'Telefono · tipo da verificare', value })),
        ...(candidate.linkedin ? [{ field: 'linkedin', label: 'LinkedIn', value: candidate.linkedin }] : []),
      ];
      results.innerHTML = suggestions.map((item, index) => `<div class="datagma-result-row"><span><strong>${esc(item.label)}</strong><small>${esc(item.value)}</small></span><div class="connect-actions"><button type="button" class="text-button" data-contactout-copy="${index}">Copia</button><button type="button" class="text-button" data-contactout-apply="${index}">Inserisci</button></div></div>`).join('');
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
