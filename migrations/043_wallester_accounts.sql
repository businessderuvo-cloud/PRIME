CREATE TABLE IF NOT EXISTS wallester_connections (
 tenant_id TEXT NOT NULL REFERENCES tenants(id),
 user_id TEXT NOT NULL REFERENCES users(id),
 credentials_cipher TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','connected','error')),
 account_label TEXT NOT NULL DEFAULT '',
 last_verified_at TEXT,
 last_error TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 sync_status TEXT NOT NULL DEFAULT 'idle' CHECK(sync_status IN ('idle','running','error')),
 sync_done INTEGER NOT NULL DEFAULT 0,
 sync_total INTEGER NOT NULL DEFAULT 0,
 next_sync_at INTEGER NOT NULL DEFAULT 0,
 last_synced_at TEXT,
 PRIMARY KEY(tenant_id)
);

CREATE TABLE IF NOT EXISTS wallester_accounts (
 tenant_id TEXT NOT NULL REFERENCES tenants(id),
 account_id TEXT NOT NULL,
 name TEXT NOT NULL,
 currency_code TEXT NOT NULL DEFAULT '',
 balance REAL,
 available_amount REAL,
 blocked_amount REAL,
 status TEXT NOT NULL DEFAULT '',
 is_main INTEGER NOT NULL DEFAULT 0,
 updated_at TEXT NOT NULL,
 PRIMARY KEY(tenant_id,account_id)
);

CREATE TABLE IF NOT EXISTS wallester_transactions (
 tenant_id TEXT NOT NULL REFERENCES tenants(id),
 account_id TEXT NOT NULL,
 record_id TEXT NOT NULL,
 record_date TEXT NOT NULL DEFAULT '',
 record_type TEXT NOT NULL DEFAULT '',
 record_status TEXT NOT NULL DEFAULT '',
 description TEXT NOT NULL DEFAULT '',
 merchant_name TEXT NOT NULL DEFAULT '',
 account_amount REAL,
 account_currency_code TEXT NOT NULL DEFAULT '',
 transaction_amount REAL,
 transaction_currency_code TEXT NOT NULL DEFAULT '',
 details_json TEXT NOT NULL DEFAULT '{}',
 updated_at TEXT NOT NULL,
 PRIMARY KEY(tenant_id,account_id,record_id)
);

CREATE INDEX IF NOT EXISTS wallester_transactions_recent
 ON wallester_transactions(tenant_id,record_date DESC,record_id DESC);
