ALTER TABLE tenants ADD COLUMN account_status TEXT NOT NULL DEFAULT 'active' CHECK(account_status IN ('active','suspended','closed'));
CREATE TABLE admin_audit (
 id INTEGER PRIMARY KEY,
 admin_email TEXT NOT NULL,
 action TEXT NOT NULL,
 tenant_id TEXT,
 details TEXT NOT NULL DEFAULT '{}',
 created_at TEXT NOT NULL
);
CREATE INDEX admin_audit_tenant_time ON admin_audit(tenant_id,created_at DESC);
