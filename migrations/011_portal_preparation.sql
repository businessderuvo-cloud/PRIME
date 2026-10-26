CREATE TABLE portal_settings (
 tenant_id TEXT NOT NULL, portal TEXT NOT NULL, account_reference TEXT NOT NULL DEFAULT '',
 channel TEXT NOT NULL DEFAULT 'api', updated_at TEXT NOT NULL,
 PRIMARY KEY (tenant_id,portal)
);
CREATE TABLE portal_drafts (
 tenant_id TEXT NOT NULL, portal TEXT NOT NULL, property_id TEXT NOT NULL,
 operation TEXT NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL,
 PRIMARY KEY (tenant_id,portal,property_id)
);
