CREATE TABLE telephony_settings (
 tenant_id TEXT NOT NULL REFERENCES tenants(id),
 provider TEXT NOT NULL CHECK(provider IN ('zadarma','cloudtalk')),
 credentials_cipher TEXT NOT NULL,
 phone_number TEXT NOT NULL,
 sip TEXT NOT NULL DEFAULT '',
 verified_at TEXT NOT NULL,
 demo INTEGER NOT NULL DEFAULT 0 CHECK(demo IN (0,1)),
 updated_by TEXT NOT NULL REFERENCES users(id),
 PRIMARY KEY(tenant_id,provider)
);
