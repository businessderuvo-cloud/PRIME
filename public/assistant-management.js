import { schema } from './schema.js';

export function assistantResultMarkup(message, index, esc) {
  let html = '';
  if (message.proposal) {
    const proposal = message.proposal;
    html += `<section class="assistant-action-card"><strong>${esc(proposal.title)}</strong><dl>${proposal.changes.map((change) => `<div><dt>${esc(change.label)}</dt><dd>${change.before ? `<small>Prima: ${esc(change.before)}</small>` : ''}<span>${esc(change.after)}</span></dd></div>`).join('')}</dl>${proposal.status === 'pending' ? `<div class="assistant-action-buttons"><button type="button" class="primary" data-assistant-confirm="${index}">Conferma</button><button type="button" class="secondary" data-assistant-cancel="${index}">Annulla</button></div><small>Salva solo dopo la tua conferma. La proposta scade dopo 30 minuti.</small>` : `<span class="pill">${proposal.status === 'applied' ? 'Operazione completata' : 'Proposta annullata'}</span>`}<p data-assistant-action-status role="status"></p></section>`;
  }
  if (message.editor) html += `<button type="button" class="secondary" data-assistant-editor="${index}">${message.editor.id ? 'Apri la scheda' : 'Completa la nuova scheda'}</button>`;
  if (message.manager) html += '<button type="button" class="secondary" data-assistant-manager>Gestisci schede</button>';
  if (message.memories?.length) html += `<details class="assistant-memory-list"><summary>Gestisci le tue ${message.memories.length} memorie</summary>${message.memories.map((memory) => `<article><p>${esc(memory.content)}</p><button type="button" class="text-button" data-assistant-forget="${esc(memory.id)}">Rimuovi dalla memoria</button><p role="status"></p></article>`).join('')}</details>`;
  return html;
}

export function openAssistantRecordManager({ state, esc, openEditor, navigate, mode = 'manage' }) {
  document.querySelector('#assistant-record-manager')?.remove();
  const dialog = document.createElement('dialog');
  dialog.id = 'assistant-record-manager';
  dialog.className = 'assistant-record-manager';
  const initial = schema[state.page] ? state.page : 'contacts';
  dialog.innerHTML = `<header class="dialog-header"><div><p class="eyebrow">VERONICA · GESTIONE DATI</p><h2>${mode === 'create' ? 'Crea una scheda' : 'Gestisci ogni scheda'}</h2></div><button type="button" class="icon-button" data-manager-close aria-label="Chiudi">×</button></header><div class="dialog-body"><p class="small-note">Scegli una sezione. I dati vengono registrati quando salvi il modulo, con i permessi del tuo account.</p><details class="assistant-manager-examples"><summary>Puoi anche scrivermelo in chat</summary><p>“Crea contatto Mario Rossi con telefono 3331234567 e email mario@esempio.it”</p><p>“Modifica il prezzo dell’immobile Trilocale Centro a 250000”</p><p>“Aggiungi nota al contatto Mario Rossi: preferisce il pomeriggio”</p><p>“Ricorda che preferisco risposte sintetiche”</p></details><div class="assistant-manager-toolbar"><label>Sezione<select data-manager-entity>${Object.entries(schema).map(([key, definition]) => `<option value="${key}" ${key === initial ? 'selected' : ''}>${esc(definition.label)}</option>`).join('')}</select></label><button type="button" class="primary" data-manager-create>Nuova scheda</button></div><label>Cerca una scheda<input type="search" data-manager-query placeholder="Nome, via, interno o riferimento…"></label><div class="assistant-manager-records" data-manager-records></div><details class="assistant-manager-areas"><summary>Account, mappa e altre aree</summary><div class="assistant-action-buttons">${[['dashboard', 'Panoramica'], ['territory', 'Territorio'], ['map', 'Mappa e zone'], ...(state.me.role === 'owner' ? [['agents', 'Agenti e inviti']] : []), ['connect', 'Collegamenti API'], ['mail', 'Email'], ['security', 'Sicurezza account']].map(([key, label]) => `<button type="button" class="secondary" data-manager-page="${key}">${label}</button>`).join('')}</div><p class="small-note">Credenziali, inviti, caricamento dei file e operazioni sui servizi collegati si gestiscono nelle rispettive schermate.</p></details></div>`;
  document.body.append(dialog);
  dialog.querySelector('[data-manager-close]').onclick = () => dialog.close();
  dialog.addEventListener('close', () => dialog.remove(), { once: true });
  const section = dialog.querySelector('[data-manager-entity]'), search = dialog.querySelector('[data-manager-query]'), list = dialog.querySelector('[data-manager-records]');
  const draw = () => {
    const query = search.value.trim().toLocaleLowerCase('it');
    const records = (state.data[section.value] || []).filter((row) => !query || `${row.title} ${row.search_text || ''}`.toLocaleLowerCase('it').includes(query));
    list.innerHTML = records.slice(0, 60).map((record) => `<button type="button" class="assistant-manager-record" data-manager-id="${esc(record.id)}"><strong>${esc(record.title)}</strong><small>${esc(String(record.search_text || '').slice(0, 180))}</small><span>Apri e modifica ↗</span></button>`).join('') || '<p class="muted">Nessuna scheda trovata. Puoi crearne una nuova.</p>';
    if (records.length > 60) list.insertAdjacentHTML('beforeend', '<p class="small-note">Mostrate le prime 60 schede: affina la ricerca.</p>');
    list.querySelectorAll('[data-manager-id]').forEach((button) => { button.onclick = () => {
      const entity = section.value, record = records.find((row) => row.id === button.dataset.managerId);
      dialog.close(); openEditor(entity, record);
    }; });
  };
  section.onchange = () => { search.value = ''; draw(); };
  search.oninput = draw;
  dialog.querySelector('[data-manager-create]').onclick = () => { const entity = section.value; dialog.close(); openEditor(entity); };
  dialog.querySelectorAll('[data-manager-page]').forEach((button) => { button.onclick = () => { const page = button.dataset.managerPage; dialog.close(); navigate(page); }; });
  draw(); dialog.showModal();
}
