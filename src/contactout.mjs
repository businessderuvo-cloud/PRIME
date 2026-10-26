import { ApiError } from './validation.mjs';

const admin = (session) => {
  if (!['owner', 'manager'].includes(session.role)) throw new ApiError(403, 'Configurazione riservata al titolare o responsabile.');
};
const text = (value) => typeof value === 'string' ? value.trim().slice(0, 500) : '';
const strings = (value) => [...new Set((Array.isArray(value) ? value : [value]).map(text).filter(Boolean))].slice(0, 15);
const email = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const linkedIn = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && ['linkedin.com', 'www.linkedin.com'].includes(url.hostname) && url.pathname.startsWith('/in/') && !url.username && !url.password;
  } catch { return false; }
};

export function normalizeContactOut(profile) {
  const work = strings(profile.work_email).filter(email);
  const personal = strings(profile.personal_email).filter(email);
  const known = new Set([...work, ...personal]);
  const other = strings(profile.email).filter((value) => email(value) && !known.has(value));
  return {
    name: text(profile.full_name), profession: text(profile.headline).slice(0, 200),
    linkedin: linkedIn(profile.url) ? profile.url : '',
    emails: [...work.map((value) => ({ value, kind: 'Email di lavoro' })), ...personal.map((value) => ({ value, kind: 'Email personale' })), ...other.map((value) => ({ value, kind: 'Email' }))],
    phones: strings(profile.phone).filter((value) => /^\+?[\d\s().-]{6,50}$/.test(value) && value.replace(/\D/g, '').length >= 6),
  };
}

export function contactOutService({ db, vault, fetcher = fetch, json, readBody, audit }) {
  const pending = new Set();
  const context = (tenant) => `contactout:${tenant}`;
  const getConfig = (tenant) => {
    const row = db.prepare('SELECT * FROM contactout_settings WHERE tenant_id=?').get(tenant);
    return row ? { ...vault.open(row.credentials_cipher, context(tenant)), verified_at: row.verified_at } : {};
  };
  const publicConfig = (tenant) => {
    const config = getConfig(tenant);
    return { configured: !!config.api_token, token_set: !!config.api_token, verified_at: config.verified_at || null };
  };
  async function call(token, route, body) {
    let response;
    try {
      response = await fetcher('https://api.contactout.com/v1/' + route, {
        method: body ? 'POST' : 'GET', redirect: 'error',
        headers: { Accept: 'application/json', token, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000),
      });
    } catch { throw new ApiError(502, 'ContactOut non è raggiungibile. Riprova più tardi.'); }
    if (response.status === 429) throw new ApiError(429, 'Limite richieste ContactOut raggiunto. Attendi prima di riprovare.');
    if (response.status === 403) throw new ApiError(409, 'ContactOut non autorizza questa operazione: verifica crediti e abilitazione API del piano.');
    if (response.status === 400 || response.status === 401) throw new ApiError(409, 'ContactOut ha rifiutato il token o i dati della richiesta. Controlla le credenziali e i dati del contatto.');
    if (response.status === 404 && route === 'people/enrich') return { profile: null };
    if (!response.ok) throw new ApiError(502, 'La richiesta ContactOut non è riuscita. Nessun dato è stato salvato nel CRM.');
    let result;
    try { result = await response.json(); } catch { throw new ApiError(502, 'Risposta ContactOut non valida.'); }
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw new ApiError(502, 'Risposta ContactOut non valida.');
    if (result.status_code === 404 && route === 'people/enrich') return { profile: null };
    if (result.status_code && result.status_code !== 200) throw new ApiError(502, 'ContactOut non ha confermato l’operazione. Verifica il tuo account.');
    return result;
  }
  async function route(req, res, url, session) {
    if (!url.pathname.startsWith('/api/contactout')) return false;
    if (session.role === 'external') throw new ApiError(403, 'Accesso ContactOut non disponibile per questo profilo.');
    if (url.pathname === '/api/contactout/settings') {
      if (req.method === 'GET') { json(res, 200, publicConfig(session.tenant_id)); return true; }
      admin(session);
      if (req.method === 'DELETE') {
        db.prepare('DELETE FROM contactout_settings WHERE tenant_id=?').run(session.tenant_id);
        audit(session, 'contactout.settings_removed', session.tenant_id);
        json(res, 200, { ok: true, configured: false }); return true;
      }
      if (req.method !== 'PUT') throw new ApiError(405, 'Metodo non consentito.');
      const body = await readBody(req);
      if (Object.keys(body).some((key) => key !== 'api_token')) throw new ApiError(400, 'Campo ContactOut non consentito.');
      const old = getConfig(session.tenant_id);
      const token = body.api_token === '' || body.api_token === undefined ? old.api_token : body.api_token;
      if (typeof token !== 'string' || !token.trim() || token.length > 8192 || /[\s\x00-\x1f\x7f]/.test(token)) throw new ApiError(400, 'Inserisci un token API ContactOut valido.');
      await call(token, 'stats');
      const now = new Date().toISOString();
      db.prepare('INSERT INTO contactout_settings(tenant_id,credentials_cipher,verified_at,updated_by,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(tenant_id) DO UPDATE SET credentials_cipher=excluded.credentials_cipher,verified_at=excluded.verified_at,updated_by=excluded.updated_by,updated_at=excluded.updated_at')
        .run(session.tenant_id, vault.seal({ api_token: token }, context(session.tenant_id)), now, session.user_id, now);
      audit(session, 'contactout.settings_verified', session.tenant_id);
      json(res, 200, { ok: true, ...publicConfig(session.tenant_id) }); return true;
    }
    if (url.pathname === '/api/contactout/enrich' && req.method === 'POST') {
      const body = await readBody(req);
      if (Object.keys(body).some((key) => !['contact_id', 'identifier', 'consent'].includes(key)) || body.consent !== true) throw new ApiError(400, 'Conferma l’invio dei dati a ContactOut.');
      if (typeof body.contact_id !== 'string') throw new ApiError(400, 'Seleziona un contatto salvato.');
      const person = db.prepare('SELECT * FROM contacts WHERE tenant_id=? AND id=?').get(session.tenant_id, body.contact_id);
      if (!person) throw new ApiError(404, 'Contatto non trovato.');
      if (person.do_not_contact) throw new ApiError(409, 'Ricerca disabilitata: il contatto ha chiesto di non essere ricontattato.');
      const config = getConfig(session.tenant_id);
      if (!config.api_token) throw new ApiError(409, 'Configura prima ContactOut in PRIME Connect.');
      const payload = { include: ['work_email', 'personal_email', 'phone'] };
      if (body.identifier === 'email' && email(person.email)) payload.email = person.email;
      else if (body.identifier === 'phone' && /^\+?[\d\s().-]{6,50}$/.test(person.phone)) payload.phone = person.phone;
      else if (body.identifier === 'linkedin') {
        const row = db.prepare("SELECT value FROM contact_methods WHERE tenant_id=? AND contact_id=? AND method_type='LinkedIn' ORDER BY updated_at DESC LIMIT 1").get(session.tenant_id, person.id);
        if (!linkedIn(row?.value)) throw new ApiError(400, 'Salva un profilo LinkedIn valido nella scheda del contatto.');
        payload.linkedin_url = row.value;
      } else throw new ApiError(400, 'Salva prima l’email, il telefono o il profilo LinkedIn selezionato.');
      const key = `${session.tenant_id}:${person.id}`;
      if (pending.has(key)) throw new ApiError(409, 'Una ricerca ContactOut per questo contatto è già in corso.');
      pending.add(key);
      try {
        audit(session, 'contactout.enrich_requested', person.id);
        const result = await call(config.api_token, 'people/enrich', payload);
        const profile = result.profile;
        if (profile && (typeof profile !== 'object' || Array.isArray(profile))) {
          if (Array.isArray(profile) && profile.length === 0) { json(res, 200, { found: false, candidate: null }); return true; }
          throw new ApiError(502, 'ContactOut ha restituito un risultato non riconosciuto.');
        }
        const candidate = profile ? normalizeContactOut(profile) : null;
        const found = !!candidate && !!(candidate.name || candidate.profession || candidate.linkedin || candidate.emails.length || candidate.phones.length);
        audit(session, found ? 'contactout.enrich_found' : 'contactout.enrich_empty', person.id);
        json(res, 200, { found, candidate: found ? candidate : null }); return true;
      } finally { pending.delete(key); }
    }
    throw new ApiError(404, 'Operazione ContactOut non disponibile.');
  }
  return { route };
}
