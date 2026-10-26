import { randomUUID } from 'node:crypto';
import { schema } from '../public/schema.js';
import { ApiError } from './validation.mjs';
import { transaction } from './database.mjs';

const normalize = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const unquote = (value) => value.trim().replace(/^["“«]|["”»]$/g, '').trim();
const aliases = {
  streets: ['via', 'vie'], buildings: ['civico', 'stabile', 'condominio'], units: ['appartamento', 'interno'],
  contacts: ['contatto', 'persona', 'cliente', 'proprietario'], properties: ['immobile'], activities: ['attività wps', 'attivita wps', 'attività', 'compito wps'],
  appointments: ['appuntamento', 'visita'], unit_contacts: ['collegamento appartamento', 'referente appartamento'], contact_methods: ['recapito', 'social'],
  contact_interactions: ['interazione', 'chiamata', 'telemarketing'], buyer_profiles: ['esigenza acquirente', 'richiesta acquirente'],
  viewing_feedback: ['feedback visita', 'esito visita'], deals: ['trattativa'], offers: ['proposta', 'controproposta'], valuations: ['valutazione'],
  leases: ['locazione', 'contratto'], commissions: ['provvigione'], documents: ['documento'], signature_requests: ['richiesta di firma', 'firma elettronica'],
};
const fieldAliases = { telefono: 'phone', cellulare: 'phone', mail: 'email', nome: 'title', titolo: 'title', nota: 'notes', prezzo: 'price', 'lead caldo': 'is_hot_lead', 'non ricontattare': 'do_not_contact', professione: 'profession', citta: 'city', 'tipo contatto': 'contact_type', 'tipo numero': 'phone_kind', piano: 'floor', locali: 'rooms', superficie: 'area', 'stato commerciale': 'commercial_status' };
const protectedFields = { documents: ['file_reference'], signature_requests: ['provider_envelope_id', 'sent_at', 'signed_at', 'audit_reference'] };
const stripArticle = (value) => value.replace(/^(?:(?:un|una|uno|nuovo|nuova|il|la|lo|del|della|dello|al|alla)\s+|(?:l|dell)['’])+/i, '').trim();
const entityTokens = Object.entries(schema).flatMap(([entity, def]) => [...new Set([entity, def.label, def.singular, ...(aliases[entity] || [])])].map((label) => ({ entity, label: normalize(label) }))).sort((a, b) => b.label.length - a.label.length);
function entityFrom(text) {
  const value = stripArticle(text), key = normalize(value);
  const match = entityTokens.find((item) => key === item.label || key.startsWith(item.label + ' ') || key.startsWith(item.label + ':'));
  return match ? { entity: match.entity, rest: value.slice(match.label.length).replace(/^\s*:\s*/, '').trim() } : null;
}
function fieldKey(entity, label) {
  const key = normalize(label).replace(/\s*[€·(].*$/, '').trim();
  if (Object.hasOwn(schema[entity].fields, label)) return label;
  const direct = fieldAliases[key];
  if (direct && schema[entity].fields[direct]) return direct;
  const matches = Object.entries(schema[entity].fields).filter(([name, field]) => normalize(name) === key || normalize(field.label).replace(/\s*[€·(].*$/, '').trim() === key);
  if (matches.length !== 1) throw new ApiError(400, `Campo «${label}» non riconosciuto in ${schema[entity].label}. Usa Gestisci schede per scegliere il campo.`);
  return matches[0][0];
}

export function assistantManagement({ db, readBody, json, audit, previewSave, saveEntity, deleteEntity, authorize, rows }) {
  const memories = (s) => db.prepare('SELECT id,content,created_at FROM assistant_memories WHERE tenant_id=? AND user_id=? ORDER BY created_at DESC,id LIMIT 100').all(s.tenant_id, s.user_id);
  const record = (entity, id, s) => {
    if (!Object.hasOwn(schema, entity)) throw new ApiError(404, 'Scheda non disponibile.');
    const row = db.prepare(`SELECT * FROM ${entity} WHERE tenant_id=? AND id=?`).get(s.tenant_id, id);
    if (!row) throw new ApiError(404, 'Scheda non trovata in questa agenzia.');
    authorize(s, entity, row);
    return row;
  };
  function resolve(entity, term, s, preferredId) {
    const key = normalize(unquote(term));
    let candidates = rows(entity, s).filter((row) => row.id === term || normalize(row.title) === key);
    if (!candidates.length) candidates = rows(entity, s).filter((row) => key && normalize(row.title).includes(key));
    if (preferredId) candidates = candidates.filter((row) => row.id === preferredId);
    if (candidates.length !== 1) throw new ApiError(409, candidates.length ? `Ho trovato ${candidates.length} schede con quel nome. Apri Gestisci schede per scegliere quella corretta.` : `Non trovo «${term}» in ${schema[entity].label}. Controlla il nome o scegli la scheda da Gestisci schede.`);
    return record(entity, candidates[0].id, s);
  }
  function coerce(entity, key, value, s) {
    const field = schema[entity].fields[key];
    if (field.type === 'ref') {
      if (value === null || ['nessuno', 'vuoto', ''].includes(normalize(value))) return null;
      if (field.entity === 'members') {
        if (['io', 'me', 'mio'].includes(normalize(value))) return s.user_id;
        const members = db.prepare("SELECT u.id,u.email FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=? AND m.role<>'external'").all(s.tenant_id).filter((row) => row.id === value || normalize(row.email) === normalize(value));
        if (members.length !== 1) throw new ApiError(400, `${field.label}: specifica l’email esatta dell’agente o scegli il valore nel modulo.`);
        return members[0].id;
      }
      return resolve(field.entity, String(value), s).id;
    }
    if (field.type === 'checkbox') {
      if ([true, 1].includes(value) || ['si', 'vero', '1', 'caldo'].includes(normalize(value))) return 1;
      if ([false, 0].includes(value) || ['no', 'falso', '0'].includes(normalize(value))) return 0;
      throw new ApiError(400, `${field.label}: indica sì oppure no.`);
    }
    if (field.type === 'number') {
      if (typeof value === 'number') return value;
      let amount = String(value).replace(/[€%\s]/g, '');
      if (amount.includes(',')) amount = amount.replace(/\./g, '').replace(',', '.');
      else if (/^-?\d{1,3}(\.\d{3})+$/.test(amount)) amount = amount.replace(/\./g, '');
      if (!/^-?\d+(?:\.\d+)?$/.test(amount)) throw new ApiError(400, `${field.label}: inserisci un numero valido.`);
      return Number(amount);
    }
    if (field.options) {
      const option = field.options.find((item) => normalize(item) === normalize(value));
      if (option === undefined) throw new ApiError(400, `${field.label}: scegli tra ${field.options.join(', ')}.`);
      return option;
    }
    if (typeof value !== 'string') throw new ApiError(400, `${field.label}: inserisci un testo.`);
    if (field.type === 'datetime-local' && value && !/(Z|[+-]\d\d:\d\d)$/.test(value)) throw new ApiError(400, `${field.label}: completa data e ora nel modulo della scheda, così viene usato il tuo fuso orario.`);
    if (field.type === 'date' && /^\d\d\/\d\d\/\d{4}$/.test(value)) return value.split('/').reverse().join('-');
    return value;
  }
  function display(entity, key, value, s) {
    const field = schema[entity].fields[key];
    if (value === null || value === '') return 'Non indicato';
    if (field.type === 'checkbox') return value ? 'Sì' : 'No';
    if (field.type === 'ref') {
      const row = field.entity === 'members' ? db.prepare('SELECT u.email AS title FROM users u JOIN memberships m ON m.user_id=u.id WHERE m.tenant_id=? AND u.id=?').get(s.tenant_id, value) : db.prepare(`SELECT title FROM ${field.entity} WHERE tenant_id=? AND id=?`).get(s.tenant_id, value);
      return row?.title || 'Collegamento';
    }
    return String(value);
  }
  function store(s, payload, title, changes) {
    const id = randomUUID(), expires = Date.now() + 30 * 60 * 1000;
    db.prepare('INSERT INTO assistant_actions(id,tenant_id,user_id,payload,created_at,expires_at) VALUES (?,?,?,?,?,?)').run(id, s.tenant_id, s.user_id, JSON.stringify(payload), new Date().toISOString(), expires);
    audit(s, 'assistant.action_proposed', id);
    return { message: 'Ho preparato la proposta. Controlla i dati e premi Conferma per salvarli.', proposal: { id, title, changes, status: 'pending', expires_at: expires } };
  }
  function plan(s, input) {
    const { entity, operation, id } = input;
    if (!Object.hasOwn(schema, entity) || !['create', 'update', 'delete', 'note'].includes(operation)) throw new ApiError(400, 'Scegli una scheda e un’operazione valida.');
    const live = operation === 'create' ? null : record(entity, id, s);
    if (operation === 'delete') {
      if (!['owner', 'manager'].includes(s.role)) throw new ApiError(403, 'Solo titolare e responsabile possono eliminare schede.');
      return store(s, { operation, entity, id, version: live.version }, `Elimina · ${schema[entity].singular} · ${live.title}`, [{ label: 'Scheda da eliminare', before: live.title, after: 'Eliminata dopo conferma' }]);
    }
    if (!input.data || typeof input.data !== 'object' || Array.isArray(input.data)) throw new ApiError(400, 'Indica i dati da registrare.');
    const delta = {};
    for (const [name, value] of Object.entries(input.data)) {
      const key = fieldKey(entity, name);
      if (protectedFields[entity]?.includes(key)) throw new ApiError(400, `${schema[entity].fields[key].label}: usa la funzione dedicata della scheda.`);
      delta[key] = coerce(entity, key, value, s);
    }
    if (operation === 'note') {
      if (!schema[entity].fields.notes || typeof delta.notes !== 'string' || !delta.notes.trim()) throw new ApiError(400, 'Scrivi la nota da aggiungere.');
      delta.notes = [live.notes, delta.notes.trim()].filter(Boolean).join('\n');
    }
    if (operation === 'create' && schema[entity].fields.agent_id && !delta.agent_id) delta.agent_id = s.user_id;
    if (operation === 'create' && s.role === 'agent' && schema[entity].fields.assigned_agent_id && !delta.assigned_agent_id) delta.assigned_agent_id = s.user_id;
    const data = { ...(live ? Object.fromEntries(Object.keys(schema[entity].fields).map((key) => [key, live[key]])) : {}), ...delta };
    const missing = Object.entries(schema[entity].fields).filter(([key, field]) => field.required && (data[key] === undefined || data[key] === null || data[key] === '')).map(([, field]) => field.label);
    if (missing.length) return { message: `Per completare ${schema[entity].singular} servono: ${missing.join(', ')}. Ho preparato il modulo con i dati già indicati.`, editor: { entity, id: live?.id || null, prefill: delta } };
    const prepared = previewSave(entity, { data, version: live?.version }, s, live?.id || null);
    const changes = Object.entries(prepared).filter(([key, value]) => !live || value !== live[key]).map(([key, value]) => ({ label: schema[entity].fields[key].label, before: live ? display(entity, key, live[key], s) : '', after: display(entity, key, value, s) })).filter((item) => item.after !== 'Non indicato' || live);
    if (!changes.length) return { message: 'I dati sono già aggiornati: non ci sono modifiche da salvare.' };
    return store(s, { operation: live ? 'update' : 'create', entity, id: live?.id || null, version: live?.version, data: prepared }, `${live ? 'Aggiorna' : 'Crea'} · ${schema[entity].singular} · ${prepared.title || live?.title || ''}`, changes);
  }
  function fieldsFrom(entity, source) {
    const fields = {};
    const parts = source.split(/\s*[;\n]\s*|,\s*(?=[\p{L}_ ]{1,40}\s*[:=])/u).filter(Boolean);
    for (const part of parts) {
      const match = /^\s*([^:=]+?)\s*[:=]\s*([\s\S]*)$/.exec(part);
      if (!match) throw new ApiError(400, 'Indica i campi come “telefono: 3331234567; email: nome@esempio.it”, oppure usa Gestisci schede.');
      fields[fieldKey(entity, match[1])] = unquote(match[2]);
    }
    return fields;
  }
  function naturalFields(entity, source) {
    const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const names = [...new Set([
      ...Object.entries(fieldAliases).filter(([, key]) => schema[entity].fields[key]).map(([label]) => label),
      ...Object.entries(schema[entity].fields).flatMap(([key, field]) => [key, field.label.replace(/\s*[€·(].*$/, '').trim()]),
      ...(schema[entity].fields.phone ? ['numero di telefono'] : []),
    ])].sort((a,b) => b.length - a.length);
    const pattern = new RegExp(`(?:^|[,;]\\s*|\\s+(?:con|e)\\s+(?:il |la |lo |l['’])?)(${names.map(escape).join('|')})(?:\\s*[:=]\\s*|\\s+)`, 'giu');
    const matches = [...source.matchAll(pattern)];
    if (!matches.length) return null;
    const data = {};
    matches.forEach((match, index) => {
      const key = match[1].toLowerCase() === 'numero di telefono' ? 'phone' : fieldKey(entity, match[1]);
      const value = source.slice(match.index + match[0].length, matches[index + 1]?.index ?? source.length).trim();
      if (!value) throw new ApiError(400, `Completa il valore di ${schema[entity].fields[key].label}.`);
      data[key] = unquote(value);
    });
    return { title: source.slice(0, matches[0].index).trim(), data };
  }
  function command(s, raw) {
    const text = raw.trim(), q = normalize(text);
    if (/^(?:ricorda|memorizza)(?:\s+che)?$/i.test(text)) return { message: 'Scrivi l’informazione da conservare dopo “Ricorda che…”. Ti mostrerò la proposta prima di memorizzarla.' };
    const memory = /^(?:ricorda(?:\s+che)?|memorizza(?:\s+che)?)\s+([\s\S]+)$/i.exec(text);
    if (memory && !entityFrom(memory[1])) {
      const content = memory[1].trim();
      if (/\b(password|pin|client.?secret|api.?key|token)\b/i.test(content)) return { message: 'Per conservare credenziali usa la configurazione protetta di PRIME Connect. Nella memoria di Veronica puoi salvare preferenze e appunti operativi.' };
      if (memories(s).some((item) => normalize(item.content) === normalize(content))) return { message: 'Questa informazione è già presente nella tua memoria.' };
      return store(s, { operation: 'remember', content }, 'Memorizza per le prossime conversazioni', [{ label: 'La tua memoria privata', before: '', after: content }]);
    }
    if (/^(?:cosa ricordi|mostra(?:mi)? (?:la mia |le mie )?memori|leggi (?:la mia )?memori)/i.test(text)) {
      const items = memories(s);
      return { message: items.length ? `Ecco le informazioni che mi hai chiesto di ricordare:\n${items.map((item) => '• ' + item.content).join('\n')}` : 'Non hai ancora memorie salvate. Scrivi “Ricorda che…” per aggiungerne una.', memories: items };
    }
    const forget = /^(?:dimentica|rimuovi dalla memoria)\s+([\s\S]+)$/i.exec(text);
    if (forget) {
      const items = memories(s).filter((item) => item.id === forget[1] || normalize(item.content).includes(normalize(forget[1])));
      if (items.length !== 1) return { message: 'Apri “La mia memoria” e scegli l’informazione precisa da rimuovere.' };
      return store(s, { operation: 'forget', id: items[0].id }, 'Rimuovi dalla tua memoria', [{ label: 'Informazione', before: items[0].content, after: 'Rimossa dopo conferma' }]);
    }
    const note = /^(?:aggiungi|registra|salva|memorizza)\s+(?:una\s+)?nota\s+(?:a|al|alla|sul|sulla|per)\s+(.+?)\s*:\s*([\s\S]+)$/i.exec(text);
    if (note) {
      const match = entityFrom(note[1]);
      if (!match) return { message: 'Indica la scheda: per esempio “Aggiungi nota al contatto Mario Rossi: preferisce il pomeriggio”.' };
      return plan(s, { entity: match.entity, operation: 'note', id: resolve(match.entity, match.rest, s).id, data: { notes: note[2] } });
    }
    const hot = /^(?:segna|imposta)\s+(.+?)\s+come\s+(?:un\s+)?lead caldo[.!]?$/i.exec(text);
    if (hot) {
      const match = entityFrom(hot[1]) || { entity: 'contacts', rest: hot[1] };
      return plan(s, { entity: match.entity, operation: 'update', id: resolve(match.entity, match.rest, s).id, data: { is_hot_lead: 1 } });
    }
    const single = /^(?:cambia|modifica|imposta|aggiorna)\s+(?:il |la |lo |l['’])?(.+?)\s+(?:di |del |della |dell['’])(.+?)\s+(?:a|in|con)\s+(.+)$/i.exec(text);
    if (single) {
      const match = entityFrom(single[2]) || { entity: 'contacts', rest: single[2] };
      return plan(s, { entity: match.entity, operation: 'update', id: resolve(match.entity, match.rest, s).id, data: { [fieldKey(match.entity, single[1])]: unquote(single[3]) } });
    }
    const operation = /^(crea|aggiungi|inserisci|registra|memorizza|modifica|aggiorna|elimina|cancella|apri)\s+([\s\S]+)$/i.exec(text);
    if (operation) {
      const match = entityFrom(operation[2]);
      if (!match) return { message: 'Posso gestire tutte le schede dati di PRIME. Scegli “Gestisci schede”, oppure scrivi per esempio “Crea contatto Mario Rossi; telefono: 3331234567”.', manager: true };
      if (normalize(operation[1]) === 'apri') {
        const live = resolve(match.entity, match.rest, s);
        return { message: `Ho trovato ${live.title}. Apri la scheda per consultarla o modificarla.`, editor: { entity: match.entity, id: live.id, prefill: {} } };
      }
      const create = ['crea', 'aggiungi', 'inserisci', 'registra', 'memorizza'].includes(normalize(operation[1]));
      if (['elimina', 'cancella'].includes(normalize(operation[1]))) return plan(s, { entity: match.entity, operation: 'delete', id: resolve(match.entity, match.rest, s).id });
      let target = '', tail = '';
      const split = match.rest.indexOf(';');
      const colon = match.rest.indexOf(':');
      if (split >= 0 && (colon < 0 || split < colon)) { target = match.rest.slice(0, split); tail = match.rest.slice(split + 1); }
      else if (colon >= 0) { target = match.rest.slice(0, colon); tail = match.rest.slice(colon + 1); }
      else target = match.rest;
      let data = {};
      if (tail) {
        if (/^[^:=]+[:=]/.test(tail)) data = fieldsFrom(match.entity, tail);
        else {
          const natural = naturalFields(match.entity, tail);
          if (!natural || natural.title) throw new ApiError(400, 'Specifica il campo da aggiornare, per esempio “telefono: 3331234567”, oppure apri la scheda.');
          data = natural.data;
        }
      } else if (create) {
        const natural = naturalFields(match.entity, target);
        if (natural) { target = natural.title; data = natural.data; }
      }
      if (create) {
        if (target && !data.title) data.title = unquote(target);
        if (!target && !tail) return { message: `Apri il modulo per creare ${schema[match.entity].singular}.`, editor: { entity: match.entity, id: null, prefill: {} } };
        return plan(s, { entity: match.entity, operation: 'create', data });
      }
      const live = resolve(match.entity, unquote(target), s);
      if (!tail) return { message: 'Ho trovato la scheda. Aprila per scegliere quali dati aggiornare.', editor: { entity: match.entity, id: live.id, prefill: {} } };
      return plan(s, { entity: match.entity, operation: 'update', id: live.id, data });
    }
    if (/^(?:nuova scheda|gestisci schede|modifica scheda)/i.test(text)) return { message: 'Scegli la sezione e la scheda da gestire. Puoi creare o modificare ogni scheda dati con gli stessi controlli di PRIME.', manager: true };
    if (/\b(?:ricordi|hai memorizzato|memoria)\b/.test(q)) {
      const terms = q.split(/\W+/).filter((word) => word.length > 3 && !['ricordi', 'memoria', 'memorizzato', 'quale', 'quali', 'come', 'cosa'].includes(word));
      const items = memories(s).filter((item) => terms.some((term) => normalize(item.content).includes(term)));
      return { message: items.length ? items.map((item) => '• ' + item.content).join('\n') : 'Non trovo una memoria corrispondente. Puoi consultare “La mia memoria” o salvare una nuova informazione con “Ricorda che…”.', memories: items };
    }
    return null;
  }
  async function route(req, res, url, s) {
    if (!url.pathname.startsWith('/api/assistant/manage')) return false;
    if (s.role === 'external') throw new ApiError(403, 'Assistente non disponibile per il ruolo esterno.');
    if (url.pathname === '/api/assistant/manage/memories' && req.method === 'GET') { json(res, 200, memories(s)); return true; }
    if (url.pathname === '/api/assistant/manage/plan' && req.method === 'POST') {
      const body = await readBody(req);
      if (body.operation === 'forget') {
        const item = memories(s).find((memory) => memory.id === body.id);
        if (!item) throw new ApiError(404, 'Memoria non trovata.');
        json(res, 200, store(s, { operation: 'forget', id: item.id }, 'Rimuovi dalla tua memoria', [{ label: 'Informazione', before: item.content, after: 'Rimossa dopo conferma' }]));
      } else json(res, 200, plan(s, body));
      return true;
    }
    const match = /^\/api\/assistant\/manage\/actions\/([a-f0-9-]+)\/(confirm|cancel)$/.exec(url.pathname);
    if (match && req.method === 'POST') {
      const row = db.prepare('SELECT * FROM assistant_actions WHERE id=? AND tenant_id=? AND user_id=?').get(match[1], s.tenant_id, s.user_id);
      if (!row) throw new ApiError(404, 'Proposta non trovata.');
      if (row.status !== 'pending' || row.expires_at < Date.now()) throw new ApiError(409, 'La proposta è scaduta o è già stata gestita. Ripeti la richiesta per aggiornarla.');
      if (match[2] === 'cancel') {
        db.prepare("UPDATE assistant_actions SET status='cancelled' WHERE id=? AND status='pending'").run(row.id);
        audit(s, 'assistant.action_cancelled', row.id);
        json(res, 200, { message: 'Proposta annullata. Nessun dato modificato.', status: 'cancelled' }); return true;
      }
      const payload = JSON.parse(row.payload);
      db.prepare("UPDATE assistant_actions SET status='applying' WHERE id=? AND status='pending'").run(row.id);
      try {
        let saved = null;
        const finalize = (item) => {
          db.prepare("UPDATE assistant_actions SET status='applied',result=? WHERE id=?").run(JSON.stringify({ entity: payload.entity, id: item?.id || payload.id }), row.id);
          audit(s, 'assistant.action_applied', row.id);
        };
        if (payload.operation === 'remember') {
          saved = { id: randomUUID() };
          transaction(db, () => {
            db.prepare('INSERT INTO assistant_memories(id,tenant_id,user_id,content,created_at) VALUES (?,?,?,?,?)').run(saved.id, s.tenant_id, s.user_id, payload.content, new Date().toISOString());
            audit(s, 'assistant.memory_created', saved.id);
            finalize(saved);
          });
        } else if (payload.operation === 'forget') {
          transaction(db, () => {
            const removed = db.prepare('DELETE FROM assistant_memories WHERE id=? AND tenant_id=? AND user_id=?').run(payload.id, s.tenant_id, s.user_id);
            if (!removed.changes) throw new ApiError(409, 'La memoria è già stata rimossa.');
            audit(s, 'assistant.memory_deleted', payload.id);
            finalize();
          });
        } else {
          if (payload.operation !== 'create') record(payload.entity, payload.id, s);
          if (payload.operation === 'delete') deleteEntity(payload.entity, payload.id, payload.version, s, () => finalize());
          else saved = saveEntity(payload.entity, { data: payload.data, version: payload.version }, s, payload.id, finalize);
        }
        const message = payload.operation === 'remember' ? 'Informazione memorizzata. La ritroverai nelle prossime conversazioni con questo account e questa agenzia.' : payload.operation === 'forget' ? 'Informazione rimossa dalla tua memoria.' : payload.operation === 'delete' ? 'Scheda eliminata. Operazione registrata nel registro attività.' : 'Dati salvati in PRIME. La scheda e la cronologia sono state aggiornate.';
        json(res, 200, { message, status: 'applied', entity: payload.entity, id: saved?.id || payload.id }); return true;
      } catch (error) {
        db.prepare("UPDATE assistant_actions SET status='pending' WHERE id=? AND status='applying'").run(row.id);
        throw error;
      }
    }
    throw new ApiError(404, 'Operazione assistente non disponibile.');
  }
  function recall(s, query) {
    const q = normalize(query);
    const ignore = new Set(['come','cosa','quale','quali','quando','dove','sono','della','delle','degli','dello','questa','questo','devo','devi','puoi','potresti','dirmi','ricordi','veronica','preferenze']);
    const terms = q.split(/[^\p{L}\d]+/u).filter((word) => word.length > 3 && !ignore.has(word));
    if (/mi chiamo|mio nome/.test(q)) terms.push('nome', 'chiamo');
    const found = memories(s).map((item) => ({ ...item, score: terms.filter((word) => normalize(item.content).includes(word)).length })).filter((item) => item.score > 0).sort((a,b) => b.score - a.score).slice(0,5);
    return found.length ? `Tra le informazioni che mi hai chiesto di ricordare trovo:\n${found.map((item) => '• ' + item.content).join('\n')}` : null;
  }
  return { route, command, plan, memories, recall };
}
