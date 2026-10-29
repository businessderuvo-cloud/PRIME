CREATE TABLE integration_connections_new (
 id TEXT PRIMARY KEY,
 tenant_id TEXT NOT NULL REFERENCES tenants(id),
 user_id TEXT NOT NULL REFERENCES users(id),
 provider TEXT NOT NULL CHECK(provider IN ('google','apple','calendly','whatsapp','gmail','yahoo','outlook','infomaniak','zoho','infocert')),
 status TEXT NOT NULL DEFAULT 'connected',
 credentials_cipher TEXT NOT NULL,
 account_label TEXT NOT NULL DEFAULT '',
 calendar_id TEXT NOT NULL DEFAULT '',
 sync_enabled INTEGER NOT NULL DEFAULT 0 CHECK(sync_enabled IN (0,1)),
 sync_token TEXT NOT NULL DEFAULT '',
 last_sync_at TEXT,
 last_error TEXT NOT NULL DEFAULT '',
 next_sync_at INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 UNIQUE(tenant_id,user_id,provider),
 UNIQUE(tenant_id,id)
);
INSERT INTO integration_connections_new (
 id,tenant_id,user_id,provider,status,credentials_cipher,account_label,calendar_id,
 sync_enabled,sync_token,last_sync_at,last_error,next_sync_at,created_at,updated_at
)
SELECT
 id,tenant_id,user_id,provider,status,credentials_cipher,account_label,calendar_id,
 sync_enabled,sync_token,last_sync_at,last_error,next_sync_at,created_at,updated_at
FROM integration_connections;
DROP TABLE integration_connections;
ALTER TABLE integration_connections_new RENAME TO integration_connections;
CREATE INDEX integrations_due ON integration_connections(sync_enabled,next_sync_at);
