CREATE TABLE agency_billing (
 tenant_id TEXT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
 kyb_status TEXT NOT NULL DEFAULT 'unverified' CHECK (kyb_status IN ('unverified','pending','approved','rejected')),
 kyb_reference TEXT,
 approved_at TEXT
);
CREATE TABLE franchise_enquiries (
 tenant_id TEXT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
 message TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
