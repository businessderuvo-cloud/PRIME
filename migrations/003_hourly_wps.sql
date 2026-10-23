CREATE TABLE activities_hourly (
 id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL REFERENCES tenants(id),title TEXT NOT NULL,agent_id TEXT NOT NULL,
 activity_type TEXT NOT NULL CHECK(activity_type IN ('chiamata','richiamo','porta a porta','censimento','acquisizione','appuntamento proprietario','visita acquirente','trattativa','follow-up')),
 priority TEXT NOT NULL DEFAULT 'normale' CHECK(priority IN ('bassa','normale','alta','urgente')),
 starts_at TEXT NOT NULL,due_at TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pianificata' CHECK(status IN ('pianificata','in corso','completata','non completata','annullata')),
 goal INTEGER NOT NULL DEFAULT 1 CHECK(goal>0),progress INTEGER NOT NULL DEFAULT 0 CHECK(progress>=0 AND progress<=goal),
 outcome TEXT NOT NULL DEFAULT '',next_action TEXT NOT NULL DEFAULT '',street_id TEXT,building_id TEXT,unit_id TEXT,contact_id TEXT,property_id TEXT,
 notes TEXT NOT NULL DEFAULT '',version INTEGER NOT NULL DEFAULT 1,
 created_by TEXT NOT NULL REFERENCES users(id),updated_by TEXT NOT NULL REFERENCES users(id),created_at TEXT NOT NULL,updated_at TEXT NOT NULL,
 UNIQUE(tenant_id,id),CHECK(due_at>starts_at),
 CHECK(status NOT IN ('completata','non completata') OR length(trim(outcome))>0),
 FOREIGN KEY(agent_id,tenant_id) REFERENCES memberships(user_id,tenant_id),
 FOREIGN KEY(tenant_id,street_id) REFERENCES streets(tenant_id,id),FOREIGN KEY(tenant_id,building_id) REFERENCES buildings(tenant_id,id),FOREIGN KEY(tenant_id,unit_id) REFERENCES units(tenant_id,id),FOREIGN KEY(tenant_id,contact_id) REFERENCES contacts(tenant_id,id),FOREIGN KEY(tenant_id,property_id) REFERENCES properties(tenant_id,id)
);
-- Legacy records had a deadline only. Keep that deadline and propose a 60-minute block.
INSERT INTO activities_hourly(id,tenant_id,title,agent_id,activity_type,priority,starts_at,due_at,status,goal,progress,outcome,next_action,street_id,building_id,unit_id,contact_id,property_id,notes,version,created_by,updated_by,created_at,updated_at)
 SELECT id,tenant_id,title,agent_id,activity_type,priority,strftime('%Y-%m-%dT%H:%M:%fZ',due_at,'-1 hour'),due_at,status,goal,progress,outcome,next_action,street_id,building_id,unit_id,contact_id,property_id,notes,version,created_by,updated_by,created_at,updated_at FROM activities;
DROP TABLE activities;
ALTER TABLE activities_hourly RENAME TO activities;
CREATE INDEX activities_tenant_due ON activities(tenant_id,agent_id,due_at);
CREATE INDEX activities_tenant_start ON activities(tenant_id,agent_id,starts_at);
-- A linked meeting already has authoritative times: retain those instead of a default.
UPDATE activities SET starts_at=(SELECT starts_at FROM appointments WHERE appointments.tenant_id=activities.tenant_id AND appointments.activity_id=activities.id),due_at=(SELECT ends_at FROM appointments WHERE appointments.tenant_id=activities.tenant_id AND appointments.activity_id=activities.id) WHERE EXISTS(SELECT 1 FROM appointments WHERE appointments.tenant_id=activities.tenant_id AND appointments.activity_id=activities.id);
