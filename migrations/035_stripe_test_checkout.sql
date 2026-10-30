CREATE TABLE stripe_test_checkouts (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id), user_id TEXT NOT NULL,
 plan TEXT NOT NULL, cycle TEXT NOT NULL, cents INTEGER NOT NULL, session_id TEXT UNIQUE,
 request_key TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'creating', created_at TEXT NOT NULL,
 UNIQUE(tenant_id,request_key)
);
CREATE TABLE stripe_test_events(event_id TEXT PRIMARY KEY, event_type TEXT NOT NULL, received_at TEXT NOT NULL);
