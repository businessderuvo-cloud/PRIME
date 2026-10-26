import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createApp } from './server.mjs';

test('Base keeps core operations, rejects excluded APIs and enforces seats atomically', async () => {
  let providerCalls = 0;
  const app = createApp({ database: ':memory:', edition: 'base', connectFetch: async () => { providerCalls++; throw Error('No providers in Base'); } });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  const password = randomBytes(24).toString('hex');
  async function request(session, route, method = 'GET', data) {
    const response = await fetch(origin + route, { method, headers: { 'Content-Type': 'application/json', ...(session ? { Cookie: session.cookie, 'X-CSRF-Token': session.csrf } : {}) }, ...(data ? { body: JSON.stringify(data) } : {}) });
    return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
  }
  async function owner(email) {
    const registered = await request(null, '/api/auth', 'POST', { mode: 'register', email, password, agency: 'Agenzia Base' });
    assert.equal(registered.status, 201);
    const token = new URL(registered.body.verification_url).searchParams.get('verify');
    assert.equal((await request(null, '/api/auth/verify-email', 'POST', { token })).status, 200);
    const login = await request(null, '/api/auth', 'POST', { mode: 'login', email, password });
    const me = await request({ cookie: login.cookie }, '/api/me');
    return { ...me.body, cookie: login.cookie };
  }
  try {
    const a = await owner('base-owner@example.test');
    assert.equal(a.edition, 'base');
    assert.equal(a.human_seat_limit, 2);
    const home = await fetch(origin + '/');
    assert.match(await home.text(), /PRIME Base/);
    for (const route of ['/api/entities/contacts','/api/entities/streets','/api/entities/activities','/api/entities/documents','/api/entities/leases','/api/dashboard','/api/matching','/api/media','/api/backups/status']) {
      assert.equal((await request(a, route)).status, 200, route);
    }
    const created = await request(a, '/api/entities/streets', 'POST', { data: { title: 'Via Base', city: 'Roma' } });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal((await request(a, '/api/search?q=Via%20Base')).body.length, 1);
    for (const route of ['/api/assistant/chat','/api/assistant/manage/plan','/api/connect','/api/connect/callback/google','/api/portals','/api/contactout','/api/signatures/settings','/api/imports','/api/entities/commissions','/api/entities/signature_requests','/api/integrations','/api/public/vanessa/browser']) {
      for (const method of ['GET','POST']) assert.equal((await request(a, route, method, method === 'POST' ? {} : undefined)).status, 403, `${method} ${route}`);
    }
    // The edition cannot be changed by requests, query parameters or preferences.
    assert.equal((await request(a, '/api/me?edition=full')).body.edition, 'base');
    await request(a, '/api/preferences', 'PATCH', { theme: 'light', edition: 'full' });
    assert.equal((await request(a, '/api/me')).body.edition, 'base');
    const invites = await Promise.all(['one','two'].map(name => request(a, '/api/agents', 'POST', { email: `${name}@example.test` })));
    assert.deepEqual(invites.map(x => x.status).sort(), [201,403]);
    assert.equal(app.db.prepare('SELECT COUNT(*) n FROM memberships WHERE tenant_id=?').get(a.tenant_id).n, 2);
    const b = await owner('other-base-owner@example.test');
    assert.equal((await request(b, '/api/entities/streets')).body.length, 0);
    assert.equal((await request(b, '/api/agents', 'POST', { email: 'other-agent@example.test' })).status, 201);
    assert.equal(providerCalls, 0);
  } finally { await new Promise(resolve => app.server.close(resolve)); app.db.close(); }
});

test('Base extra seats require server configuration', async () => {
  assert.throws(() => createApp({ edition: 'invalid' }), /Edizione/);
  assert.throws(() => createApp({ edition: 'base', baseExtraSeats: -1 }), /Posti/);
});
