CREATE TABLE stripe_agency_accounts (
 tenant_id TEXT NOT NULL REFERENCES tenants(id), mode TEXT NOT NULL CHECK(mode IN ('test','live')),
 account_id TEXT NOT NULL, credentials_cipher TEXT NOT NULL, webhook_id TEXT NOT NULL UNIQUE,
 updated_at TEXT NOT NULL, PRIMARY KEY(tenant_id,mode)
);
CREATE TABLE stripe_agency_payments (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id), mode TEXT NOT NULL,
 account_id TEXT NOT NULL, request_key TEXT NOT NULL, description TEXT NOT NULL,
 amount INTEGER NOT NULL CHECK(amount>0), currency TEXT NOT NULL DEFAULT 'eur',
 session_id TEXT UNIQUE, payment_intent TEXT, checkout_url TEXT,
 state TEXT NOT NULL DEFAULT 'creating', refunded INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(tenant_id,mode,request_key)
);
CREATE TABLE stripe_agency_events (
 tenant_id TEXT NOT NULL REFERENCES tenants(id), mode TEXT NOT NULL CHECK(mode IN ('test','live')),
 account_id TEXT NOT NULL, event_id TEXT NOT NULL, processed_at TEXT NOT NULL,
 PRIMARY KEY(tenant_id,mode,event_id)
);
