CREATE TABLE application_feedback (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  user_id TEXT NOT NULL,
  message TEXT NOT NULL CHECK(length(trim(message)) BETWEEN 1 AND 2000),
  status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','reviewed','closed')),
  created_at TEXT NOT NULL,
  FOREIGN KEY(user_id,tenant_id) REFERENCES memberships(user_id,tenant_id)
);
CREATE INDEX application_feedback_inbox ON application_feedback(tenant_id,created_at DESC);
