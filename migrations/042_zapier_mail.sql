CREATE TABLE zapier_mail_tokens (
 tenant_id TEXT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 token_hash TEXT NOT NULL,
 created_at TEXT NOT NULL
);

CREATE TABLE zapier_mail_notifications (
 tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 message_id TEXT NOT NULL,
 sender TEXT NOT NULL,
 subject TEXT NOT NULL,
 provider_url TEXT NOT NULL,
 received_at TEXT NOT NULL,
 notified_at TEXT NOT NULL,
 dismissed INTEGER NOT NULL DEFAULT 0 CHECK(dismissed IN (0,1)),
 PRIMARY KEY(tenant_id, message_id)
);

CREATE INDEX zapier_mail_recent ON zapier_mail_notifications(tenant_id,user_id,notified_at DESC);
