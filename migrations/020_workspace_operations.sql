ALTER TABLE properties ADD COLUMN mandate_expires_on TEXT NOT NULL DEFAULT '';
CREATE TABLE import_previews (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id), user_id TEXT NOT NULL REFERENCES users(id),
 entity TEXT NOT NULL, payload TEXT NOT NULL, created_at INTEGER NOT NULL, committed_at INTEGER
);
CREATE INDEX import_previews_tenant ON import_previews(tenant_id,user_id,created_at);
