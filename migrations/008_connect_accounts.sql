CREATE TABLE integration_settings (
 tenant_id TEXT NOT NULL REFERENCES tenants(id), provider TEXT NOT NULL CHECK(provider IN ('google','apple','calendly','whatsapp','gmail','yahoo','outlook')),
 config_cipher TEXT NOT NULL, updated_by TEXT NOT NULL REFERENCES users(id), updated_at TEXT NOT NULL,
 PRIMARY KEY(tenant_id,provider)
);
CREATE TABLE integration_connections (
 id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL REFERENCES tenants(id),user_id TEXT NOT NULL REFERENCES users(id),
 provider TEXT NOT NULL CHECK(provider IN ('google','apple','calendly','whatsapp','gmail','yahoo','outlook')),status TEXT NOT NULL DEFAULT 'connected',
 credentials_cipher TEXT NOT NULL,account_label TEXT NOT NULL DEFAULT '',calendar_id TEXT NOT NULL DEFAULT '',
 sync_enabled INTEGER NOT NULL DEFAULT 0 CHECK(sync_enabled IN (0,1)),sync_token TEXT NOT NULL DEFAULT '',
 last_sync_at TEXT,last_error TEXT NOT NULL DEFAULT '',next_sync_at INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(tenant_id,user_id,provider),UNIQUE(tenant_id,id)
);
CREATE TABLE integration_oauth_states (
 state_hash TEXT PRIMARY KEY,tenant_id TEXT NOT NULL REFERENCES tenants(id),user_id TEXT NOT NULL REFERENCES users(id),provider TEXT NOT NULL,
 verifier_cipher TEXT NOT NULL,redirect_uri TEXT NOT NULL,expires_at INTEGER NOT NULL
);
CREATE TABLE calendar_event_links (
 connection_id TEXT NOT NULL REFERENCES integration_connections(id) ON DELETE CASCADE,appointment_id TEXT NOT NULL,
 external_id TEXT NOT NULL,etag TEXT NOT NULL DEFAULT '',local_version INTEGER NOT NULL DEFAULT 0,remote_updated TEXT NOT NULL DEFAULT '',
 PRIMARY KEY(connection_id,appointment_id),UNIQUE(connection_id,external_id)
);
CREATE TABLE integration_jobs (
 id TEXT PRIMARY KEY,connection_id TEXT NOT NULL REFERENCES integration_connections(id) ON DELETE CASCADE,appointment_id TEXT NOT NULL,
 payload TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,next_attempt_at INTEGER NOT NULL DEFAULT 0,last_error TEXT NOT NULL DEFAULT '',
 UNIQUE(connection_id,appointment_id)
);
CREATE TABLE external_busy_events (
 connection_id TEXT NOT NULL REFERENCES integration_connections(id) ON DELETE CASCADE,external_id TEXT NOT NULL,
 starts_at TEXT NOT NULL,ends_at TEXT NOT NULL,PRIMARY KEY(connection_id,external_id)
);
CREATE TABLE calendar_conflicts (
 id TEXT PRIMARY KEY,connection_id TEXT NOT NULL REFERENCES integration_connections(id) ON DELETE CASCADE,appointment_id TEXT NOT NULL,
 reason TEXT NOT NULL,remote_payload TEXT NOT NULL,created_at TEXT NOT NULL,resolved_at TEXT,
 UNIQUE(connection_id,appointment_id)
);
CREATE TABLE owner_update_requests (
 id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL REFERENCES tenants(id),user_id TEXT NOT NULL REFERENCES users(id),
 property_id TEXT,contact_id TEXT,appointment_id TEXT,booking_url TEXT NOT NULL DEFAULT '',meeting_url TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'in attesa di prenotazione',notes TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,updated_at TEXT NOT NULL,
 UNIQUE(tenant_id,id),FOREIGN KEY(tenant_id,property_id) REFERENCES properties(tenant_id,id),FOREIGN KEY(tenant_id,contact_id) REFERENCES contacts(tenant_id,id)
);
CREATE TABLE integration_webhook_receipts (
 connection_id TEXT NOT NULL REFERENCES integration_connections(id) ON DELETE CASCADE,event_id TEXT NOT NULL,received_at TEXT NOT NULL,
 PRIMARY KEY(connection_id,event_id)
);
CREATE TABLE whatsapp_opt_ins (
 tenant_id TEXT NOT NULL REFERENCES tenants(id),contact_id TEXT NOT NULL,phone TEXT NOT NULL,user_id TEXT NOT NULL REFERENCES users(id),
 granted_at TEXT NOT NULL,revoked_at TEXT,PRIMARY KEY(tenant_id,contact_id,phone),FOREIGN KEY(tenant_id,contact_id) REFERENCES contacts(tenant_id,id)
);
CREATE TABLE whatsapp_messages (
 id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL REFERENCES tenants(id),user_id TEXT REFERENCES users(id),connection_id TEXT NOT NULL REFERENCES integration_connections(id),
 contact_id TEXT,phone TEXT NOT NULL,direction TEXT NOT NULL CHECK(direction IN ('in','out')),message_type TEXT NOT NULL,
 body TEXT NOT NULL DEFAULT '',provider_message_id TEXT UNIQUE,status TEXT NOT NULL,idempotency_key TEXT UNIQUE,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,
 FOREIGN KEY(tenant_id,contact_id) REFERENCES contacts(tenant_id,id)
);
ALTER TABLE appointments ADD COLUMN meeting_mode TEXT NOT NULL DEFAULT 'in presenza' CHECK(meeting_mode IN ('in presenza','videocall','telefono'));
ALTER TABLE appointments ADD COLUMN video_provider TEXT NOT NULL DEFAULT '' CHECK(video_provider IN ('','Google Meet','Calendly','Link esterno'));
ALTER TABLE appointments ADD COLUMN meeting_url TEXT NOT NULL DEFAULT '';
CREATE INDEX integrations_due ON integration_connections(sync_enabled,next_sync_at);
CREATE INDEX busy_time_window ON external_busy_events(starts_at,ends_at);
CREATE TABLE mail_notifications (
 connection_id TEXT NOT NULL REFERENCES integration_connections(id) ON DELETE CASCADE,
 message_id TEXT NOT NULL, sender TEXT NOT NULL, subject TEXT NOT NULL,
 provider_url TEXT NOT NULL, received_at TEXT NOT NULL, notified_at TEXT NOT NULL, dismissed INTEGER NOT NULL DEFAULT 0 CHECK(dismissed IN (0,1)),
 PRIMARY KEY(connection_id,message_id)
);
CREATE INDEX mail_notifications_recent ON mail_notifications(notified_at DESC);
