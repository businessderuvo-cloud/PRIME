CREATE TABLE stripe_agency_oauth_states (
 state_hash TEXT PRIMARY KEY,
 tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 mode TEXT NOT NULL CHECK(mode IN ('test','live')),
 created_at TEXT NOT NULL,
 expires_at TEXT NOT NULL
);

CREATE INDEX stripe_agency_oauth_states_expiry ON stripe_agency_oauth_states(expires_at);
