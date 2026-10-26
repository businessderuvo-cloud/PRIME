import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { ApiError } from './validation.mjs';
import { transaction } from './database.mjs';

const admin = (s) => { if (!['owner', 'manager'].includes(s.role)) throw new ApiError(403, 'Configurazione riservata al titolare o responsabile.'); };
const safeUrl = (value, label) => {
  try { const u = new URL(value); if (u.protocol !== 'https:' || u.username || u.password) throw Error(); return u.href.replace(/\/$/, ''); }
  catch { throw new ApiError(400, `${label}: inserisci un URL HTTPS valido.`); }
};
const responseBody = async (response) => {
  const text = await response.text();
  try { return text ? JSON.parse(text) : {}; } catch { return {}; }
};
const apiRoot = (c) => c.api_base_url.replace(/\/api\/?$/i, '').replace(/\/$/, '');
const activationMessage = 'Richiesta di attivazione integrazione Namirial Sign Enterprise per l’agenzia.';

export function namirialService({ db, vault, directory, fetcher = fetch, json, readBody, audit }) {
  const context = (tenant) => `signature-provider:${tenant}:namirial`;
  const config = (tenant) => {
    const row = db.prepare('SELECT config_cipher FROM signature_provider_settings WHERE tenant_id=?').get(tenant);
    return row ? vault.open(row.config_cipher, context(tenant)) : {};
  };
  const publicConfig = (tenant, role) => {
    const c = config(tenant), out = { configured: !!(c.api_base_url && c.token_url && c.organization_id && c.client_id && c.client_secret), activation_requested: !!db.prepare("SELECT 1 FROM application_feedback WHERE tenant_id=? AND message=? AND status IN ('new','reviewed') LIMIT 1").get(tenant, activationMessage) };
    if (['owner', 'manager'].includes(role)) Object.assign(out, { environment: c.environment || (!c.api_base_url || c.api_base_url.includes('demo-eu-ie1') ? 'demo' : 'production'), api_base_url: c.api_base_url || '', token_url: c.token_url || '', organization_id: c.organization_id || '', client_id: c.client_id || '', client_secret_set: !!c.client_secret });
    return out;
  };
  async function call(c, method, route, { token, body, headers = {} } = {}) {
    let response;
    const requestHeaders = { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers };
    if (typeof body === 'string' && !Object.keys(requestHeaders).some((key) => key.toLowerCase() === 'content-type')) requestHeaders['Content-Type'] = 'application/json';
    try {
      response = await fetcher(new URL(route.replace(/^\//, ''), apiRoot(c) + '/'), {
        method, headers: requestHeaders,
        ...(body !== undefined ? { body } : {}), signal: AbortSignal.timeout(20000),
      });
    } catch { throw new ApiError(502, 'Namirial non è raggiungibile. Verifica gli endpoint configurati e riprova.'); }
    const payload = await responseBody(response);
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) throw new ApiError(502, 'Namirial ha rifiutato l’accesso API. Verifica Service Account, organizzazione e permessi.');
      if (response.status === 429) throw new ApiError(429, 'Limite richieste Namirial raggiunto. Riprova più tardi.');
      throw new ApiError(502, `Namirial ha rifiutato l’operazione (${response.status}). Verifica la configurazione del flusso nell’istanza.`);
    }
    return { payload, response };
  }
  async function accessToken(c) {
    const form = new URLSearchParams({ client_id: c.client_id, client_secret: c.client_secret, grant_type: 'client_credentials' });
    let response;
    try { response = await fetcher(c.token_url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body: form, signal: AbortSignal.timeout(15000) }); }
    catch { throw new ApiError(502, 'Endpoint OAuth Namirial non raggiungibile.'); }
    const payload = await responseBody(response);
    if (!response.ok || typeof payload.access_token !== 'string') throw new ApiError(502, 'Namirial non ha rilasciato un token. Verifica Service Account ed endpoint OAuth.');
    return payload.access_token;
  }
  const prefix = (c, id) => `/api/v1/organizations/${encodeURIComponent(c.organization_id)}/envelopes/${encodeURIComponent(id)}`;
  async function sendSignature(s, id) {
    const request = db.prepare('SELECT * FROM signature_requests WHERE tenant_id=? AND id=?').get(s.tenant_id, id);
    if (!request) throw new ApiError(404, 'Richiesta di firma non trovata.');
    if (request.provider !== 'Namirial') throw new ApiError(409, 'Questa richiesta non usa Namirial.');
    if (!['da configurare', 'bozza'].includes(request.status) || request.provider_envelope_id) throw new ApiError(409, 'La richiesta non è più una bozza inviabile.');
    const doc = db.prepare("SELECT * FROM documents WHERE tenant_id=? AND id=? AND status='disponibile' AND file_reference=id").get(s.tenant_id, request.document_id);
    if (!doc) throw new ApiError(409, 'Carica prima il PDF nella scheda Documenti.');
    const contact = db.prepare('SELECT * FROM contacts WHERE tenant_id=? AND id=?').get(s.tenant_id, request.signer_contact_id);
    if (!contact?.email) throw new ApiError(409, 'Il firmatario deve avere un indirizzo email nella sua scheda.');
    if (!['semplice', 'qualificata (QES)'].includes(request.signature_level)) throw new ApiError(409, 'Seleziona il livello di firma prima dell’invio. Il flusso avanzato va abilitato e validato con Namirial prima di poterlo usare.');
    const signerPhone = String(contact.phone || '').replace(/[\s().-]/g, '');
    if (request.signature_level === 'qualificata (QES)' && !/^\+[1-9]\d{7,14}$/.test(signerPhone)) throw new ApiError(409, 'Per la firma qualificata usa e getta, salva nella scheda firmatario un cellulare con prefisso internazionale (ad esempio +39).');
    const c = config(s.tenant_id);
    if (!c.api_base_url || !c.token_url || !c.organization_id || !c.client_id || !c.client_secret) throw new ApiError(409, 'Il titolare deve completare prima la configurazione Namirial in Connect.');
    const token = await accessToken(c), org = encodeURIComponent(c.organization_id), root = `/api/v1/organizations/${org}/envelopes`;
    const relativeFile = path.join(createHash('sha256').update(s.tenant_id).digest('hex'), 'documents', request.document_id + '.pdf');
    const pdfPath = path.join(directory, 'uploads', relativeFile);
    if (!existsSync(pdfPath)) throw new ApiError(409, 'Il PDF associato non è disponibile nell’archivio dell’agenzia.');
    const pdf = readFileSync(pdfPath), fileName = String(doc.file_name || doc.title + '.pdf').replace(/[\\/\r\n]/g, '_').slice(0, 180);
    const envelope = await call(c, 'POST', root, { token, body: JSON.stringify({ name: request.title, signatureFormat: request.signature_format || 'Pades', signatureReason: request.title }) });
    const envelopeId = envelope.payload.id;
    if (!envelopeId) throw new ApiError(502, 'Namirial non ha restituito l’identificativo della pratica.');
    let uploadedFileId = '';
    try {
      const form = new FormData(); form.append('file', new Blob([pdf], { type: 'application/pdf' }), fileName);
      const uploaded = await call(c, 'POST', `${root}/${encodeURIComponent(envelopeId)}/files`, { token, body: form });
      uploadedFileId = uploaded.payload.id;
      const stage = await call(c, 'POST', `${root}/${encodeURIComponent(envelopeId)}/stages`, { token, body: JSON.stringify({ type: 'Signer', name: 'Firma cliente', requiredRecipientCompletions: 1 }) });
      if (!stage.payload.id) throw new ApiError(502, 'Namirial non ha restituito la fase di firma.');
      const [givenName, ...surnameParts] = String(contact.title || '').trim().split(/\s+/);
      const recipientBody = { type: 'Standard', givenName: givenName || contact.title, surname: surnameParts.join(' ') || '', email: contact.email, languageCode: 'it-IT', notificationChannels: ['Email'], ...(request.signature_level === 'qualificata (QES)' ? { phoneNumber: signerPhone, signatureConfiguration: { disposableCertificate: { verificationPhoneNumber: signerPhone } } } : {}) };
      const recipient = await call(c, 'POST', `${root}/${encodeURIComponent(envelopeId)}/stages/${encodeURIComponent(stage.payload.id)}/recipients`, { token, body: JSON.stringify(recipientBody) });
      const recipientId = recipient.payload.id;
      if (!recipientId || !uploadedFileId) throw new ApiError(502, 'Namirial non ha restituito il firmatario o il documento.');
      const signatureType = request.signature_level === 'qualificata (QES)' ? 'DisposableCertificateSignature' : 'ClickToSignSignature';
      const fields = { tasks: [{ sortOrder: 1, recipientId, field: { id: 'prime-signature', fieldType: 'Signature', page: 1, positionX: 100, positionY: 100, width: 220, height: 55, required: true, allowedSignatureTypes: [{ signatureType }] } }] };
      await call(c, 'PUT', `${root}/${encodeURIComponent(envelopeId)}/files/${encodeURIComponent(uploadedFileId)}/tasks`, { token, body: JSON.stringify(fields) });
      await call(c, 'POST', `${root}/${encodeURIComponent(envelopeId)}/send`, { token });
      let shareUrl = '';
      try {
        const links = await call(c, 'GET', `${prefix(c, envelopeId)}/next-recipient-links`, { token });
        const candidate = links.payload.nextRecipientLinks?.find((entry) => entry.recipient?.id === recipientId)?.link || links.payload.nextRecipientLinks?.[0]?.link || '';
        try { const parsed = new URL(candidate); if (parsed.protocol === 'https:' && !parsed.username && !parsed.password && candidate.length < 4096) shareUrl = parsed.href; } catch { /* ignore non-HTTPS or malformed action links */ }
      } catch { /* invitation by email remains usable even if this instance does not expose recipient links */ }
      const now = new Date().toISOString();
      transaction(db, () => {
        db.prepare("UPDATE signature_requests SET provider_envelope_id=?,status='inviata',sent_at=?,version=version+1,updated_by=?,updated_at=? WHERE tenant_id=? AND id=?").run(envelopeId, now, s.user_id, now, s.tenant_id, id);
        if (shareUrl) db.prepare('INSERT INTO signature_provider_links(tenant_id,request_id,link_cipher,created_at) VALUES (?,?,?,?) ON CONFLICT(tenant_id,request_id) DO UPDATE SET link_cipher=excluded.link_cipher,created_at=excluded.created_at').run(s.tenant_id, id, vault.seal({ url: shareUrl }, `signature-link:${s.tenant_id}:${id}`), now);
        audit(s, 'signature.namirial.sent', id);
      });
      return { ok: true, envelope_id: envelopeId, share_link_available: !!shareUrl };
    } catch (error) {
      // The external envelope may already exist; retain its ID to prevent accidental duplicate sends.
      if (envelopeId) db.prepare("UPDATE signature_requests SET provider_envelope_id=?,status='errore',version=version+1,updated_by=?,updated_at=? WHERE tenant_id=? AND id=? AND provider_envelope_id=''").run(envelopeId, s.user_id, new Date().toISOString(), s.tenant_id, id);
      throw error;
    }
  }
  async function refresh(s, id) {
    const row = db.prepare("SELECT * FROM signature_requests WHERE tenant_id=? AND id=? AND provider='Namirial'").get(s.tenant_id, id);
    if (!row) throw new ApiError(404, 'Richiesta Namirial non trovata.');
    if (!row.provider_envelope_id) throw new ApiError(409, 'La pratica non è ancora stata inviata.');
    const c = config(s.tenant_id); if (!c.client_secret) throw new ApiError(409, 'Configurazione Namirial incompleta.');
    const token = await accessToken(c), { payload } = await call(c, 'GET', prefix(c, row.provider_envelope_id), { token });
    const statusMap = { Completed: 'firmata', Rejected: 'rifiutata', Expired: 'scaduta', InProgress: 'inviata' }, status = statusMap[payload.status];
    if (status && status !== row.status) {
      const now = new Date().toISOString();
      db.prepare('UPDATE signature_requests SET status=?,signed_at=?,version=version+1,updated_by=?,updated_at=? WHERE tenant_id=? AND id=?').run(status, status === 'firmata' ? now : row.signed_at, s.user_id, now, s.tenant_id, id);
      audit(s, 'signature.namirial.status', id);
    }
    return { status: status || row.status, provider_status: payload.status };
  }
  async function route(req, res, url, s) {
    if (!url.pathname.startsWith('/api/signatures')) return false;
    if (s.role === 'external') throw new ApiError(403, 'Accesso alla firma non disponibile per questo profilo.');
    const method = req.method, suffix = url.pathname.slice('/api/signatures'.length);
    if (suffix === '/activation-request' && method === 'POST') {
      admin(s);
      transaction(db, () => {
        const existing = db.prepare("SELECT id FROM application_feedback WHERE tenant_id=? AND message=? AND status IN ('new','reviewed') LIMIT 1").get(s.tenant_id, activationMessage);
        if (existing) return;
        const id = randomUUID();
        db.prepare('INSERT INTO application_feedback(id,tenant_id,user_id,message,created_at) VALUES (?,?,?,?,?)').run(id, s.tenant_id, s.user_id, activationMessage, new Date().toISOString());
        audit(s, 'signature.namirial.activation_requested', id);
      });
      json(res, 200, { ok: true, activation_requested: true }); return true;
    }
    if (suffix === '/settings' && method === 'GET') { json(res, 200, publicConfig(s.tenant_id, s.role)); return true; }
    if (suffix === '/settings' && method === 'PUT') {
      admin(s); const body = await readBody(req), old = config(s.tenant_id);
      for (const key of Object.keys(body)) if (!['environment', 'api_base_url', 'token_url', 'organization_id', 'client_id', 'client_secret'].includes(key)) throw new ApiError(400, 'Campo configurazione Namirial non valido.');
      const next = { ...old };
      if (body.environment !== undefined) {
        if (!['demo', 'production'].includes(body.environment)) throw new ApiError(400, 'Seleziona l’ambiente demo o produzione.');
        next.environment = body.environment;
      }
      if (body.api_base_url) next.api_base_url = safeUrl(body.api_base_url, 'URL API Namirial');
      if (body.token_url) next.token_url = safeUrl(body.token_url, 'URL OAuth Namirial');
      for (const key of ['organization_id', 'client_id', 'client_secret']) if (body[key]) { if (typeof body[key] !== 'string' || body[key].trim().length > 500) throw new ApiError(400, 'Valore configurazione Namirial non valido.'); next[key] = body[key].trim(); }
      if (!next.api_base_url || !next.token_url || !next.organization_id || !next.client_id || !next.client_secret) throw new ApiError(400, 'Completa ID organizzazione e credenziali dell’account di servizio. Controlla gli endpoint nella sezione Impostazioni tecniche.');
      await accessToken(next);
      const now = new Date().toISOString(); db.prepare('INSERT INTO signature_provider_settings VALUES (?,?,?,?) ON CONFLICT(tenant_id) DO UPDATE SET config_cipher=excluded.config_cipher,updated_by=excluded.updated_by,updated_at=excluded.updated_at').run(s.tenant_id, vault.seal(next, context(s.tenant_id)), s.user_id, now);
      audit(s, 'signature.namirial.settings', s.tenant_id); return json(res, 200, { ok: true, ...publicConfig(s.tenant_id, s.role) });
    }
    const match = /^\/([a-f0-9-]+)\/(send|refresh|link)$/.exec(suffix);
    if (!match) throw new ApiError(404, 'Operazione firma non disponibile.');
    const [, id, action] = match;
    if (method === 'POST' && action === 'send') { json(res, 200, await sendSignature(s, id)); return true; }
    if (method === 'POST' && action === 'refresh') { json(res, 200, await refresh(s, id)); return true; }
    if (method === 'GET' && action === 'link') {
      const row = db.prepare('SELECT link_cipher FROM signature_provider_links WHERE tenant_id=? AND request_id=?').get(s.tenant_id, id);
      if (!row) throw new ApiError(404, 'Link Namirial non disponibile per questa pratica.');
      json(res, 200, { url: vault.open(row.link_cipher, `signature-link:${s.tenant_id}:${id}`).url });
      return true;
    }
    throw new ApiError(405, 'Metodo non consentito.');
  }
  return { route };
}
