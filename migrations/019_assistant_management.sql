CREATE TABLE assistant_memories (
 id TEXT PRIMARY KEY,
 tenant_id TEXT NOT NULL REFERENCES tenants(id),
 user_id TEXT NOT NULL,
 content TEXT NOT NULL CHECK(length(content) BETWEEN 1 AND 2000),
 created_at TEXT NOT NULL,
 FOREIGN KEY(user_id,tenant_id) REFERENCES memberships(user_id,tenant_id)
);
CREATE INDEX assistant_memories_scope ON assistant_memories(tenant_id,user_id,created_at);
CREATE TABLE assistant_actions (
 id TEXT PRIMARY KEY,
 tenant_id TEXT NOT NULL REFERENCES tenants(id),
 user_id TEXT NOT NULL,
 payload TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','applying','applied','cancelled')),
 created_at TEXT NOT NULL,
 expires_at INTEGER NOT NULL,
 result TEXT NOT NULL DEFAULT '',
 FOREIGN KEY(user_id,tenant_id) REFERENCES memberships(user_id,tenant_id)
);
CREATE INDEX assistant_actions_scope ON assistant_actions(tenant_id,user_id,status,expires_at);
