CREATE TABLE elite_conversations (
 id TEXT PRIMARY KEY,
 tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 agent_id TEXT NOT NULL,
 provider_agent_id TEXT NOT NULL,
 conversation_id TEXT NOT NULL UNIQUE,
 mode TEXT NOT NULL CHECK(mode IN ('workspace','copilot','voice')),
 state TEXT NOT NULL DEFAULT 'active' CHECK(state IN ('active','ending','done','failed')),
 transcript_json TEXT NOT NULL DEFAULT '[]',
 summary TEXT NOT NULL DEFAULT '',
 duration_secs REAL NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL,
 finished_at TEXT
);
CREATE INDEX elite_conversation_tenant ON elite_conversations(tenant_id,created_at);
