import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { createApp } from './server.mjs';
import { normalizeContactOut } from './src/contactout.mjs';

let app, base, owner, agent, other, external, person, linked;
let providerStatus = 200, providerProfile, requests = [];
function member(tenant, role) {
  const id = randomUUID(), token = randomBytes(32).toString('hex'), csrf = randomBytes(16).toString('hex');
  app.db.prepare('INSERT INTO users(id,email,password) VALUES (?,?,?)').run(id, id + '@example.invalid', 'disabled');
  app.db.prepare('INSERT INTO memberships VALUES (?,?,?)').run(id, tenant, role);
  app.db.prepare('INSERT INTO sessions(token,user_id,tenant_id,expires,csrf) VALUES (?,?,?,?,?)').run(createHash('sha256').update(token).digest('hex'), id, tenant, Date.now() + 600000, csrf);
  return { id, tenant, cookie: 'prime_session=' + token, csrf };
}
async function request(user, route, method = 'GET', body, csrf = true) {
  const res = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json', ...(user ? { Cookie: user.cookie, ...(csrf ? { 'X-CSRF-Token': user.csrf } : {}) } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  return { status: res.status, body: await res.json() };
}
before(async () => {
  app = createApp({ database: ':memory:', connectFetch: async (url, options) => {
    requests.push({ url: String(url), ...options });
    if (String(url).endsWith('/stats')) return new Response(JSON.stringify({ status_code: providerStatus, usage: {} }), { status: providerStatus });
    return new Response(JSON.stringify({ status_code: providerStatus, profile: providerProfile }), { status: providerStatus });
  } });
  for (const tenant of ['contactout-a', 'contactout-b']) app.db.prepare('INSERT INTO tenants(id,name) VALUES (?,?)').run(tenant, tenant);
  owner = member('contactout-a', 'owner'); agent = member(owner.tenant, 'agent'); external = member(owner.tenant, 'external'); other = member('contactout-b', 'owner');
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  base = 'http://127.0.0.1:' + app.server.address().port;
  const result = await request(owner, '/api/entities/contacts', 'POST', { data: { title: 'Persona di prova', email: 'persona@example.invalid', phone: '+390212345678' } });
  assert.equal(result.status, 201); person = result.body;
  const method = await request(owner, '/api/entities/contact_methods', 'POST', { data: { title: 'LinkedIn test', contact_id: person.id, method_type: 'LinkedIn', value: 'https://www.linkedin.com/in/persona-fixture' } });
  assert.equal(method.status, 201); linked = method.body;
});
after(async () => { await new Promise((resolve) => app.server.close(resolve)); app.db.close(); });

test('ContactOut: token cifrato, mai restituito, permessi e CSRF', async () => {
  assert.equal((await request(null, '/api/contactout/settings')).status, 401);
  assert.equal((await request(external, '/api/contactout/settings')).status, 403);
  assert.equal((await request(owner, '/api/contactout/settings', 'PUT', { api_token: 'fixture-api-token' }, false)).status, 403);
  assert.equal((await request(agent, '/api/contactout/settings', 'PUT', { api_token: 'fixture-api-token' })).status, 403);
  assert.equal((await request(owner, '/api/contactout/settings', 'PUT', { api_token: 'fixture-api-token' })).status, 200);
  const saved = app.db.prepare('SELECT credentials_cipher FROM contactout_settings WHERE tenant_id=?').get(owner.tenant);
  assert.ok(!saved.credentials_cipher.includes('fixture-api-token'));
  const cfg = await request(agent, '/api/contactout/settings');
  assert.equal(cfg.body.configured, true); assert.ok(!JSON.stringify(cfg.body).includes('fixture-api-token'));
  assert.equal((await request(other, '/api/contactout/settings')).body.configured, false);
  const last = requests.at(-1); assert.equal(last.url, 'https://api.contactout.com/v1/stats'); assert.equal(last.headers.token, 'fixture-api-token');
  assert.equal(last.redirect, 'error');
});
test('ContactOut: ricerca manuale dal CRM senza modifica automatica o richieste per altre agenzie', async () => {
  providerProfile = { full_name: 'Persona di prova', headline: 'Agente immobiliare', work_email: ['lavoro@example.invalid'], personal_email: ['privata@example.invalid'], phone: ['+393331234567'], url: linked.value };
  const count = requests.length;
  assert.equal((await request(other, '/api/contactout/enrich', 'POST', { contact_id: person.id, identifier: 'email', consent: true })).status, 404);
  assert.equal((await request(owner, '/api/contactout/enrich', 'POST', { contact_id: person.id, identifier: 'email' })).status, 400);
  assert.equal(requests.length, count);
  const response = await request(agent, '/api/contactout/enrich', 'POST', { contact_id: person.id, identifier: 'email', consent: true });
  assert.equal(response.status, 200); assert.equal(response.body.found, true);
  assert.equal(response.body.candidate.emails.length, 2); assert.deepEqual(response.body.candidate.phones, ['+393331234567']);
  assert.deepEqual(JSON.parse(requests.at(-1).body), { include: ['work_email', 'personal_email', 'phone'], email: person.email });
  assert.equal(app.db.prepare('SELECT phone FROM contacts WHERE id=?').get(person.id).phone, person.phone);
  assert.equal(app.db.prepare('SELECT count(*) AS n FROM contact_methods WHERE contact_id=?').get(person.id).n, 1);
  const linkedin = await request(owner, '/api/contactout/enrich', 'POST', { contact_id: person.id, identifier: 'linkedin', consent: true });
  assert.equal(linkedin.status, 200); assert.equal(JSON.parse(requests.at(-1).body).linkedin_url, linked.value);
});
test('ContactOut: rispetta non ricontattare e non consente payload arbitrari', async () => {
  app.db.prepare('UPDATE contacts SET do_not_contact=1 WHERE id=?').run(person.id);
  const count = requests.length;
  assert.equal((await request(owner, '/api/contactout/enrich', 'POST', { contact_id: person.id, identifier: 'email', consent: true })).status, 409);
  assert.equal(requests.length, count);
  app.db.prepare('UPDATE contacts SET do_not_contact=0 WHERE id=?').run(person.id);
  assert.equal((await request(owner, '/api/contactout/enrich', 'POST', { contact_id: person.id, identifier: 'email', consent: true, email: 'altro@example.invalid' })).status, 400);
});
test('ContactOut: nessun risultato, crediti esauriti, rate limit e configurazione fallita', async () => {
  const lookup = () => request(owner, '/api/contactout/enrich', 'POST', { contact_id: person.id, identifier: 'phone', consent: true });
  providerStatus = 404; assert.equal((await lookup()).body.found, false);
  providerStatus = 403; assert.equal((await lookup()).status, 409);
  providerStatus = 429; assert.equal((await lookup()).status, 429);
  providerStatus = 401;
  assert.equal((await request(owner, '/api/contactout/settings', 'PUT', { api_token: 'wrong-token' })).status, 409);
  providerStatus = 200;
  await request(owner, '/api/contactout/settings', 'PUT', { api_token: '' });
  assert.equal(requests.at(-1).headers.token, 'fixture-api-token');
});
test('ContactOut: rimozione della chiave e asset dei link esterni', async () => {
  assert.equal((await request(agent, '/api/contactout/settings', 'DELETE')).status, 403);
  assert.equal((await request(owner, '/api/contactout/settings', 'DELETE')).status, 200);
  assert.equal((await request(owner, '/api/contactout/enrich', 'POST', { contact_id: person.id, identifier: 'email', consent: true })).status, 409);
  const frontend = await fetch(base + '/contactout.js').then((res) => res.text());
  assert.ok(frontend.includes('https://telecontact.it/')); assert.ok(frontend.includes('https://app.whuis.com/login'));
  for (const icon of ['contactout.png', 'telecontact.png', 'whuis.png']) assert.equal((await fetch(base + '/brands/providers/' + icon)).status, 200);
});
test('ContactOut: normalizza risultati, rimuove duplicati e URL social non validi', () => {
  const result = normalizeContactOut({ work_email: ['a@example.invalid', 'a@example.invalid'], email: ['a@example.invalid', 'b@example.invalid', 'invalid'], phone: ['+390212345678', '+390212345678', '<script>'], url: 'javascript:alert(1)' });
  assert.equal(result.emails.length, 2); assert.deepEqual(result.phones, ['+390212345678']); assert.equal(result.linkedin, '');
});
