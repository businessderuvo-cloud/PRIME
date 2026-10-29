import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createApp } from "./server.mjs";
import { createProviders } from "./src/connect/providers.mjs";

test("mail OAuth, refresh, metadata-only notifications, personal isolation and disconnect", async () => {
  const calls = [], tokens = new Map();
  let failGoogle = false;
  const reply = value => new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json" } });
  const app = createApp({ database: ":memory:", connectInterval: 0, connectFetch: async (value, options = {}) => {
    const url = new URL(value); calls.push({ url, options });
    if (url.pathname.endsWith("/token")) {
      const body = new URLSearchParams(options.body), refresh = body.get("grant_type") === "refresh_token";
      const provider = url.hostname.includes("microsoft") ? "outlook" : "gmail";
      const token = `${provider}-${refresh ? "fresh" : "expired"}`; tokens.set(token, provider);
      return reply({ access_token: token, refresh_token: `${provider}-refresh`, expires_in: refresh ? 3600 : 1 });
    }
    const authorization = options.headers.Authorization;
    if (url.hostname === "openidconnect.googleapis.com") return reply({ email: "mailbox@example.test" });
    if (url.pathname === "/oidc/userinfo") return reply({ email: "outlook@example.test" });
    if (url.hostname === "gmail.googleapis.com") {
      if (failGoogle) return new Response("denied", { status: 401 });
      assert.equal(authorization, "Bearer gmail-fresh");
      if (url.pathname.endsWith("/messages")) {
        assert.deepEqual(url.searchParams.getAll("labelIds"), ["INBOX", "UNREAD"]);
        assert.equal(url.searchParams.has("q"), false);
        return reply({ messages: [{ id: "message-1" }] });
      }
      assert.equal(url.searchParams.get("format"), "metadata");
      assert.equal(url.searchParams.get("fields"), "id,internalDate,payload/headers");
      assert.deepEqual(url.searchParams.getAll("metadataHeaders"), ["From", "Subject"]);
      return reply({ id: "message-1", internalDate: String(Date.now()), payload: { headers: [{ name: "From", value: "A sender" }, { name: "Subject", value: "A subject" }] } });
    }
    if (url.hostname === "graph.microsoft.com" && url.pathname.includes("/messages")) {
      assert.equal(authorization, "Bearer outlook-fresh");
      assert.equal(url.searchParams.get("$select").includes("body"), false);
      assert.ok(url.searchParams.get("$filter").startsWith("receivedDateTime ge "));
      return reply({ value: [{ id: "outlook-message", subject: "Outlook subject", from: { emailAddress: { address: "sender@example.test" } }, receivedDateTime: new Date().toISOString(), webLink: "https://outlook.live.com/mail/0/inbox/id/outlook-message" }] });
    }
    throw new Error(`Unexpected request: ${url.origin}${url.pathname}`);
  } });
  await new Promise(resolve => app.server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`, password = randomBytes(20).toString("hex");
  async function request(session, route, method = "GET", body) {
    const response = await fetch(base + route, { redirect: "manual", method, headers: { "Content-Type": "application/json", ...(session ? { Cookie: session.cookie, "X-CSRF-Token": session.csrf } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const value = await response.text(); return { status: response.status, body: value ? JSON.parse(value) : null, headers: response.headers };
  }
  async function register(email) {
    const result = await request(null, "/api/auth", "POST", { mode: "register", email, agency: "Mail test", password });
    assert.equal(result.status, 201);
    const token = new URL(result.body.verification_url).searchParams.get('verify');
    assert.equal((await request(null, '/api/auth/verify-email', 'POST', { token })).status, 200);
    const login = await request(null, '/api/auth', 'POST', { mode: 'login', email, password });
    assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie").split(";")[0], me = await request({ cookie }, "/api/me"); return { cookie, ...me.body };
  }
  try {
    const owner = await register("owner@example.test"), other = await register("other@example.test");
    for (const provider of ["google", "outlook"]) assert.equal((await request(owner, `/api/connect/settings/${provider}`, "PUT", { base_url: base, client_id: "test-client", client_secret: "test-secret" })).status, 200);
    const status = await request(owner, "/api/connect");
    assert.equal(status.body.mailProviders.find(provider => provider.provider === "gmail").configured, true);
    assert.equal(JSON.stringify(status.body).includes("test-secret"), false);
    for (const provider of ["gmail", "outlook"]) {
      const auth = await request(owner, `/api/connect/mail/authorize/${provider}`, "POST", {});
      assert.equal(auth.status, 200);
      const url = new URL(auth.body.url), scopes = url.searchParams.get("scope");
      assert.ok(!scopes.includes("mail.google.com/") && !scopes.includes("gmail.readonly") && !scopes.includes("Mail.ReadWrite"));
      assert.ok(url.searchParams.get("code_challenge"));
      const callback = `/api/connect/callback/${provider}?state=${encodeURIComponent(url.searchParams.get("state"))}&code=example-code`;
      assert.equal((await request(null, callback)).status, 303);
      assert.equal((await request(null, callback)).status, 400);
      const connection = (await request(owner, "/api/connect")).body.connections.find(connection => connection.provider === provider);
      assert.equal((await request(other, `/api/connect/mail/connections/${connection.id}/sync`, "POST", {})).status, 404);
      assert.equal((await request(owner, `/api/connect/mail/connections/${connection.id}/sync`, "POST", {})).body.new, 1);
      assert.equal((await request(owner, `/api/connect/mail/connections/${connection.id}/sync`, "POST", {})).body.new, 0);
      const current = (await request(owner, "/api/connect")).body;
      const notification = current.mail.find(notification => notification.provider === provider);
      assert.ok(notification.sender && notification.subject);
      assert.equal("body" in notification, false); assert.equal("attachments" in notification, false);
      if (provider === "gmail") assert.equal(new URL(notification.provider_url).searchParams.get("authuser"), "mailbox@example.test");
      assert.equal((await request(other, "/api/connect")).body.mail.length, 0);
      assert.equal((await request(owner, `/api/connect/mail/connections/${connection.id}/dismiss`, "POST", { message_id: notification.message_id })).status, 200);
      assert.equal((await request(owner, "/api/connect")).body.mail.filter(mail => mail.provider === provider).length, 0);
      if (provider === "gmail") {
        failGoogle = true;
        assert.equal((await request(owner, `/api/connect/mail/connections/${connection.id}/sync`, "POST", {})).status, 401);
        assert.equal((await request(owner, "/api/connect")).body.connections.find(c => c.id === connection.id).status, "reauthorize");
      }
      assert.equal((await request(owner, `/api/connect/connections/${connection.id}`, "DELETE")).status, 200);
      assert.equal(app.db.prepare("SELECT COUNT(*) AS count FROM mail_notifications WHERE connection_id=?").get(connection.id).count, 0);
    }
    const refreshed = calls.filter(call => call.options.body && new URLSearchParams(call.options.body).get("grant_type") === "refresh_token");
    assert.equal(refreshed.length, 2);
  } finally { await new Promise(resolve => app.server.close(resolve)); app.db.close(); }
});

test("manual IMAP accounts connect, sync metadata, save mailbox type and isolate credentials", async () => {
  const calls = [];
  const app = createApp({
    database: ":memory:", connectInterval: 0,
    connectProviderApi: { mailMessages: async (provider, credentials) => {
      calls.push({ provider, credentials: { ...credentials } });
      const url = provider === "infocert" ? "https://webmail.infocert.it/legalmail/#/login" : "https://mail.infomaniak.com/";
      return [{ id: `imap-message-${provider}`, sender: "Sender Example", subject: "Oggetto di prova", url, received_at: new Date().toISOString() }];
    } },
  });
  await new Promise(resolve => app.server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`, password = randomBytes(20).toString("hex");
  async function request(session, route, method = "GET", body) {
    const response = await fetch(base + route, { redirect: "manual", method, headers: { "Content-Type": "application/json", ...(session ? { Cookie: session.cookie, "X-CSRF-Token": session.csrf } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const value = await response.text(); return { status: response.status, body: value ? JSON.parse(value) : null, headers: response.headers };
  }
  async function register(email) {
    const result = await request(null, "/api/auth", "POST", { mode: "register", email, agency: "IMAP test", password });
    assert.equal(result.status, 201);
    const token = new URL(result.body.verification_url).searchParams.get("verify");
    assert.equal((await request(null, "/api/auth/verify-email", "POST", { token })).status, 200);
    const login = await request(null, "/api/auth", "POST", { mode: "login", email, password });
    assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie").split(";")[0], me = await request({ cookie }, "/api/me");
    return { cookie, ...me.body };
  }
  try {
    const owner = await register("imap-owner@example.test"), other = await register("imap-other@example.test");
    assert.equal((await request(owner, "/api/connect/mail/imap/connect/infomaniak", "POST", { email: "casella@example.test", password: "account-password", mailbox_type: "personal" })).status, 200);
    assert.equal(calls.length, 2, "probe and initial sync both use the account connection");
    assert.ok(calls.every(call => call.provider === "infomaniak" && call.credentials.imap_host === "mail.infomaniak.com"));
    assert.ok(calls.every(call => call.credentials.imap_password === "account-password"));
    const current = (await request(owner, "/api/connect")).body;
    const connection = current.connections.find(row => row.provider === "infomaniak");
    assert.equal(connection.status, "connected");
    assert.equal(connection.account_label, "Personale · casella@example.test");
    assert.equal(current.mail[0].sender, "Sender Example");
    assert.equal(current.mail[0].subject, "Oggetto di prova");
    assert.equal("body" in current.mail[0], false);
    assert.equal(JSON.stringify(current).includes("account-password"), false);
    const cipher = app.db.prepare("SELECT credentials_cipher FROM integration_connections WHERE id=?").get(connection.id).credentials_cipher;
    assert.equal(cipher.includes("account-password"), false);
    assert.equal((await request(other, "/api/connect")).body.mail.length, 0);
    assert.equal((await request(owner, `/api/connect/mail/connections/${connection.id}/type`, "PATCH", { mailbox_type: "pec" })).status, 200);
    const changed = (await request(owner, "/api/connect")).body;
    assert.equal(changed.connections.find(row => row.id === connection.id).account_label, "PEC · casella@example.test");
    assert.equal(changed.mail.length, 1, "changing the label keeps already collected metadata");
    assert.equal((await request(owner, `/api/connect/mail/connections/${connection.id}/type`, "PATCH", { mailbox_type: "unknown" })).status, 400);
    assert.equal((await request(owner, "/api/connect/mail/imap/connect/infocert", "POST", { email: "legalmail-user-17", password: "legalmail-password", mailbox_type: "pec" })).status, 200);
    const legalmail = (await request(owner, "/api/connect")).body.connections.find(row => row.provider === "infocert");
    assert.equal(legalmail.account_label, "PEC · legalmail-user-17");
    assert.ok(calls.some(call => call.provider === "infocert" && call.credentials.imap_email === "legalmail-user-17"));
    assert.equal((await request(owner, `/api/connect/connections/${connection.id}`, "DELETE")).status, 200);
    assert.equal((await request(owner, "/api/connect")).body.connections.some(row => row.id === connection.id), false);
  } finally { await new Promise(resolve => app.server.close(resolve)); app.db.close(); }
});

test("manual IMAP reader uses fixed TLS hosts and fetches envelope metadata only", async () => {
  const sessions = [];
  class FakeImapFlow {
    constructor(options) { this.options = options; this.usable = true; sessions.push(this); }
    async connect() { this.connected = true; }
    async getMailboxLock(name, options) { this.lock = { name, options, released: false, release() { this.released = true; } }; return this.lock; }
    async search(criteria, options) { this.searchArgs = { criteria, options }; return [1, 2]; }
    async *fetch(uids, query, options) {
      this.fetchArgs = { uids, query, options };
      yield { uid: 2, envelope: { from: [{ name: "Sender", address: "sender@example.test" }], subject: "Oggetto", date: new Date() }, internalDate: new Date() };
    }
    async logout() { this.usable = false; this.loggedOut = true; }
    close() { this.usable = false; }
  }
  const api = createProviders(async () => { throw new Error("Non deve usare HTTP"); }, { ImapFlowClient: FakeImapFlow });
  const result = await api.mailMessages("infomaniak", { imap_email: "user@example.test", imap_password: "secret" });
  assert.equal(sessions.length, 1);
  assert.deepEqual({ host: sessions[0].options.host, port: sessions[0].options.port, secure: sessions[0].options.secure }, { host: "mail.infomaniak.com", port: 993, secure: true });
  assert.equal(sessions[0].options.auth.pass, "secret");
  assert.equal(sessions[0].lock.name, "INBOX");
  assert.deepEqual(sessions[0].lock.options, { readOnly: true });
  assert.equal(sessions[0].lock.released, true);
  assert.deepEqual(sessions[0].searchArgs.criteria, { seen: false });
  assert.deepEqual(sessions[0].fetchArgs.query, { uid: true, envelope: true, internalDate: true });
  assert.equal("body" in sessions[0].fetchArgs.query, false);
  assert.equal(result[0].sender, "Sender · sender@example.test");
  assert.equal(result[0].subject, "Oggetto");
  assert.equal(result[0].url, "https://mail.infomaniak.com/");
  assert.equal("body" in result[0], false);
  assert.equal(sessions[0].loggedOut, true);
});
