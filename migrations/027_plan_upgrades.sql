CREATE TABLE plan_subscriptions (
 tenant_id TEXT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
 plan TEXT NOT NULL CHECK(plan IN ('standard','pro','vip','elite')),
 cycle TEXT NOT NULL CHECK(cycle IN ('monthly','annual')),
 period_start TEXT NOT NULL,
 period_end TEXT NOT NULL,
 paid_plan_cents INTEGER NOT NULL CHECK(paid_plan_cents >= 0),
 payment_reference TEXT NOT NULL,
 revision INTEGER NOT NULL DEFAULT 1,
 state TEXT NOT NULL CHECK(state IN ('active','suspended','cancelled'))
);
CREATE TABLE plan_upgrade_quotes (
 id TEXT PRIMARY KEY,
 tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 subscription_revision INTEGER NOT NULL,
 target_plan TEXT NOT NULL,
 cycle TEXT NOT NULL,
 period_end TEXT NOT NULL,
 due_cents INTEGER NOT NULL,
 quote_json TEXT NOT NULL,
 expires_at INTEGER NOT NULL,
 state TEXT NOT NULL DEFAULT 'quoted' CHECK(state IN ('quoted','requested','paid','expired')),
 created_at TEXT NOT NULL
);
CREATE INDEX plan_upgrade_agency ON plan_upgrade_quotes(tenant_id,created_at);
