CREATE TABLE ai_subscriptions (
 tenant_id TEXT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
 plan TEXT NOT NULL CHECK(plan IN ('vip','elite')),
 billing_anchor TEXT NOT NULL,
 billing_cycle TEXT NOT NULL CHECK(billing_cycle IN ('monthly','annual')),
 state TEXT NOT NULL CHECK(state IN ('active','suspended','cancelled'))
);
CREATE TABLE ai_usage_ledger (
 id INTEGER PRIMARY KEY,
 tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 event_id TEXT NOT NULL,
 agent_id TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('minutes','simple','medium','complex')),
 units_micros INTEGER NOT NULL CHECK(units_micros>0),
 occurred_at TEXT NOT NULL,
 cycle_start TEXT NOT NULL,
 cycle_end TEXT NOT NULL,
 UNIQUE(tenant_id,event_id)
);
CREATE INDEX ai_usage_cycle ON ai_usage_ledger(tenant_id,cycle_start,kind);
