CREATE TABLE backup_pairings (
 code_hash TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id),
 user_id TEXT NOT NULL REFERENCES users(id), label TEXT NOT NULL, expires_at INTEGER NOT NULL
);
CREATE TABLE backup_devices (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id), user_id TEXT NOT NULL REFERENCES users(id),
 label TEXT NOT NULL, token_hash TEXT UNIQUE NOT NULL, public_key TEXT NOT NULL,
 created_at TEXT NOT NULL, last_download_at TEXT, last_saved_at TEXT, last_error TEXT NOT NULL DEFAULT '', revoked_at TEXT
);
CREATE INDEX backup_devices_tenant ON backup_devices(tenant_id,revoked_at);
