ALTER TABLE owner_update_requests ADD COLUMN provider_event_uri TEXT NOT NULL DEFAULT '';
ALTER TABLE owner_update_requests ADD COLUMN provider_updated_at TEXT NOT NULL DEFAULT '';
ALTER TABLE owner_update_requests ADD COLUMN appointment_version INTEGER NOT NULL DEFAULT 0;
CREATE INDEX owner_updates_pending ON owner_update_requests(tenant_id,user_id,status,created_at);
