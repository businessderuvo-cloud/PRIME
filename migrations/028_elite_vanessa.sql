CREATE TABLE elite_settings (
 tenant_id TEXT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
 outbound_greeting TEXT NOT NULL DEFAULT 'Buongiorno, sono Vanessa, l’assistente AI della sua agenzia immobiliare.',
 inbound_greeting TEXT NOT NULL DEFAULT 'Buongiorno, sono Vanessa, l’assistente AI dell’agenzia. Come posso aiutarla?',
 instructions TEXT NOT NULL DEFAULT '',
 address_style TEXT NOT NULL DEFAULT 'lei' CHECK(address_style IN ('lei','tu')),
 auto_queue INTEGER NOT NULL DEFAULT 0,
 phone_number_id TEXT NOT NULL DEFAULT '',
 phone_number TEXT NOT NULL DEFAULT '',
 updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX elite_reserved_phone ON elite_settings(phone_number_id) WHERE phone_number_id<>'';
CREATE TABLE elite_agents (
 id TEXT PRIMARY KEY,
 tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 name TEXT NOT NULL,
 personality TEXT NOT NULL DEFAULT '',
 voice_id TEXT NOT NULL DEFAULT '',
 provider_agent_id TEXT NOT NULL DEFAULT '',
 provider_branch_id TEXT NOT NULL DEFAULT '',
 sample_path TEXT NOT NULL DEFAULT '',
 state TEXT NOT NULL DEFAULT 'draft',
 created_at TEXT NOT NULL
);
CREATE INDEX elite_agent_agency ON elite_agents(tenant_id);
CREATE TABLE elite_access_tokens (
 token_hash TEXT PRIMARY KEY,
 tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 scope TEXT NOT NULL CHECK(scope IN ('workspace','copilot','phone')),
 contact_id TEXT,
 agent_id TEXT NOT NULL,
 expires_at INTEGER NOT NULL,
 created_at TEXT NOT NULL
);
CREATE TABLE elite_call_queue (
 id TEXT PRIMARY KEY,
 tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 agent_id TEXT NOT NULL,
 contact_id TEXT NOT NULL,
 unit_id TEXT,
 phone TEXT NOT NULL,
 instructions TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','starting','active','done','failed','uncertain','cancelled')),
 conversation_id TEXT,
 provider_call_id TEXT,
 error TEXT NOT NULL DEFAULT '',
 transcript_json TEXT NOT NULL DEFAULT '[]',
 summary TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL,
 started_at TEXT,
 finished_at TEXT,
 request_key TEXT NOT NULL,
 UNIQUE(tenant_id,request_key,contact_id,phone)
);
CREATE UNIQUE INDEX elite_one_active_call ON elite_call_queue(tenant_id) WHERE state IN ('starting','active','uncertain');
CREATE INDEX elite_queue_agency ON elite_call_queue(tenant_id,created_at);
