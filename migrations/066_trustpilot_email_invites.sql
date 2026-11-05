CREATE TABLE trustpilot_email_invites (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  recipient_email TEXT NOT NULL,
  recipient_name TEXT NOT NULL DEFAULT '',
  due_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','sending','sent','failed','cancelled')),
  connection_id TEXT,
  message_id TEXT NOT NULL DEFAULT '',
  receipt_requested INTEGER NOT NULL DEFAULT 1 CHECK(receipt_requested IN (0,1)),
  last_error TEXT NOT NULL DEFAULT '',
  sent_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(tenant_id)
);
CREATE INDEX trustpilot_email_invites_due ON trustpilot_email_invites(status,due_at);
