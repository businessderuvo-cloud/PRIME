ALTER TABLE signature_requests ADD COLUMN signature_format TEXT NOT NULL DEFAULT 'Pades' CHECK(signature_format IN ('Pades','Cades'));
CREATE TABLE signature_provider_settings (
 tenant_id TEXT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
 config_cipher TEXT NOT NULL,
 updated_by TEXT NOT NULL REFERENCES users(id),
 updated_at TEXT NOT NULL
);
CREATE TABLE signature_provider_links (
 tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 request_id TEXT NOT NULL,
 link_cipher TEXT NOT NULL,
 created_at TEXT NOT NULL,
 PRIMARY KEY(tenant_id,request_id),
 FOREIGN KEY(tenant_id,request_id) REFERENCES signature_requests(tenant_id,id) ON DELETE CASCADE
);
