ALTER TABLE buildings ADD COLUMN latitude REAL;
ALTER TABLE buildings ADD COLUMN longitude REAL;
ALTER TABLE properties ADD COLUMN latitude REAL;
ALTER TABLE properties ADD COLUMN longitude REAL;

CREATE TABLE territory_zones (
 id TEXT PRIMARY KEY,
 tenant_id TEXT NOT NULL REFERENCES tenants(id),
 title TEXT NOT NULL,
 agent_id TEXT NOT NULL,
 polygon_json TEXT NOT NULL,
 version INTEGER NOT NULL DEFAULT 1,
 created_by TEXT NOT NULL REFERENCES users(id),
 updated_by TEXT NOT NULL REFERENCES users(id),
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 UNIQUE(tenant_id,id),
 FOREIGN KEY(agent_id,tenant_id) REFERENCES memberships(user_id,tenant_id)
);
CREATE INDEX territory_zones_tenant_agent ON territory_zones(tenant_id,agent_id);
