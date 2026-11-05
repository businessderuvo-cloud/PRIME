CREATE TABLE trustpilot_rewards (
 tenant_id TEXT PRIMARY KEY REFERENCES tenants(id),
 review_url TEXT NOT NULL UNIQUE,
 cycle TEXT NOT NULL CHECK(cycle IN ('monthly','annual')),
 amount_cents INTEGER NOT NULL CHECK(amount_cents>0),
 payment_reference TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','fulfilled')),
 submitted_at TEXT NOT NULL,
 verified_by TEXT,
 verified_at TEXT,
 fulfillment_reference TEXT,
 fulfilled_at TEXT
);
