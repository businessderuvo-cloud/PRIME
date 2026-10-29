CREATE TABLE cpay_orders (
 id TEXT PRIMARY KEY,
 tenant_id TEXT NOT NULL REFERENCES tenants(id),
 plan TEXT NOT NULL,
 cycle TEXT NOT NULL,
 cents INTEGER NOT NULL CHECK(cents>0),
 checkout_id TEXT UNIQUE,
 identifier TEXT UNIQUE,
 charge_id TEXT UNIQUE,
 state TEXT NOT NULL DEFAULT 'creating',
 created_at TEXT NOT NULL,
 paid_at TEXT,
 checked_at INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX cpay_pending ON cpay_orders(state,checked_at);
