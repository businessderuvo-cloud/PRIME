CREATE TABLE didit_kyb_sessions (
 id TEXT PRIMARY KEY,
 tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 requested_by TEXT NOT NULL REFERENCES users(id),
 environment TEXT NOT NULL CHECK(environment IN ('sandbox','live')),
 application_id TEXT NOT NULL,
 workflow_id TEXT NOT NULL,
 vendor_data TEXT NOT NULL UNIQUE,
 session_id TEXT UNIQUE,
 verification_url TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'creating',
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 checked_at TEXT
);
CREATE INDEX didit_kyb_tenant ON didit_kyb_sessions(tenant_id,environment,created_at DESC);
CREATE UNIQUE INDEX didit_kyb_active ON didit_kyb_sessions(tenant_id,environment) WHERE status IN ('creating','not_started','in_progress','in_review','resubmitted');
CREATE TABLE didit_webhook_receipts (
 application_id TEXT NOT NULL,
 event_id TEXT NOT NULL,
 session_id TEXT NOT NULL,
 received_at TEXT NOT NULL,
 PRIMARY KEY(application_id,event_id)
);
