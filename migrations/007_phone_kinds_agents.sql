ALTER TABLE contacts ADD COLUMN phone_kind TEXT NOT NULL DEFAULT '' CHECK(phone_kind IN ('','Ufficio','Casa','Cell personale','Cell di lavoro'));
ALTER TABLE contact_methods ADD COLUMN phone_kind TEXT NOT NULL DEFAULT '' CHECK(phone_kind IN ('','Ufficio','Casa','Cell personale','Cell di lavoro'));
ALTER TABLE units ADD COLUMN assigned_agent_id TEXT REFERENCES users(id);
ALTER TABLE contacts ADD COLUMN assigned_agent_id TEXT REFERENCES users(id);
ALTER TABLE properties ADD COLUMN assigned_agent_id TEXT REFERENCES users(id);
CREATE INDEX units_assigned_agent ON units(tenant_id,assigned_agent_id);
CREATE INDEX contacts_assigned_agent ON contacts(tenant_id,assigned_agent_id);
CREATE INDEX properties_assigned_agent ON properties(tenant_id,assigned_agent_id);
