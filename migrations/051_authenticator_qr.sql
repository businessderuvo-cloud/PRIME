CREATE TABLE authenticator_devices (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 label TEXT NOT NULL, public_key TEXT NOT NULL, fingerprint TEXT NOT NULL,
 created_at INTEGER NOT NULL, last_used_at INTEGER, revoked_at INTEGER
);
CREATE INDEX authenticator_devices_user ON authenticator_devices(user_id,tenant_id);
CREATE TABLE authenticator_pairings (
 id TEXT PRIMARY KEY, token_hash TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 status TEXT NOT NULL DEFAULT 'new', device_id TEXT, label TEXT, public_key TEXT, fingerprint TEXT,
 created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL
);
CREATE TABLE authenticator_logins (
 id TEXT PRIMARY KEY, nonce_hash TEXT NOT NULL, poll_hash TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending', device_id TEXT, browser TEXT NOT NULL,
 match_code TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL
);
CREATE INDEX authenticator_logins_expiry ON authenticator_logins(expires_at);
