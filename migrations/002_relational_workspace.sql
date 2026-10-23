ALTER TABLE users ADD COLUMN theme TEXT NOT NULL DEFAULT 'dark' CHECK(theme IN ('light','dark'));
ALTER TABLE sessions ADD COLUMN csrf TEXT;
DELETE FROM sessions;
CREATE TABLE new_memberships(user_id TEXT REFERENCES users(id),tenant_id TEXT REFERENCES tenants(id),role TEXT NOT NULL CHECK(role IN ('owner','manager','agent','external')),PRIMARY KEY(user_id,tenant_id));
INSERT INTO new_memberships SELECT user_id,tenant_id,CASE role WHEN 'admin' THEN 'manager' WHEN 'viewer' THEN 'external' ELSE role END FROM memberships;
DROP TABLE memberships;
ALTER TABLE new_memberships RENAME TO memberships;

CREATE TABLE streets (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id), title TEXT NOT NULL,
 city TEXT NOT NULL, district TEXT NOT NULL DEFAULT '', postal_code TEXT NOT NULL DEFAULT '',
 census_status TEXT NOT NULL DEFAULT 'da censire' CHECK(census_status IN ('da censire','parziale','censita')),
 notes TEXT NOT NULL DEFAULT '', version INTEGER NOT NULL DEFAULT 1,
 created_by TEXT NOT NULL REFERENCES users(id),updated_by TEXT NOT NULL REFERENCES users(id),created_at TEXT NOT NULL,updated_at TEXT NOT NULL,
 UNIQUE(tenant_id,id),UNIQUE(tenant_id,city,title)
);
CREATE TABLE buildings (
 id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL REFERENCES tenants(id),title TEXT NOT NULL,street_id TEXT NOT NULL,
 concierge_name TEXT NOT NULL DEFAULT '',concierge_phone TEXT NOT NULL DEFAULT '',concierge_hours TEXT NOT NULL DEFAULT '',
 administrator_name TEXT NOT NULL DEFAULT '',administrator_phone TEXT NOT NULL DEFAULT '',administrator_email TEXT NOT NULL DEFAULT '',
 contact_source TEXT NOT NULL DEFAULT '',verified_on TEXT NOT NULL DEFAULT '',notes TEXT NOT NULL DEFAULT '',version INTEGER NOT NULL DEFAULT 1,
 created_by TEXT NOT NULL REFERENCES users(id),updated_by TEXT NOT NULL REFERENCES users(id),created_at TEXT NOT NULL,updated_at TEXT NOT NULL,
 UNIQUE(tenant_id,id),UNIQUE(tenant_id,street_id,title),FOREIGN KEY(tenant_id,street_id) REFERENCES streets(tenant_id,id)
);
CREATE TABLE units (
 id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL REFERENCES tenants(id),title TEXT NOT NULL,building_id TEXT NOT NULL,
 staircase TEXT NOT NULL DEFAULT '',floor TEXT NOT NULL DEFAULT '',area REAL NOT NULL DEFAULT 0 CHECK(area>=0),rooms INTEGER NOT NULL DEFAULT 0 CHECK(rooms>=0),
 occupancy_status TEXT NOT NULL DEFAULT 'sconosciuto' CHECK(occupancy_status IN ('sconosciuto','libero','proprietario','inquilino')),
 commercial_status TEXT NOT NULL DEFAULT 'non in vendita' CHECK(commercial_status IN ('non in vendita','in vendita','in affitto','altra agenzia')),
 acquisition_status TEXT NOT NULL DEFAULT 'da verificare' CHECK(acquisition_status IN ('da verificare','opportunità','in contatto','acquisito','non interessato')),
 notes TEXT NOT NULL DEFAULT '',version INTEGER NOT NULL DEFAULT 1,
 created_by TEXT NOT NULL REFERENCES users(id),updated_by TEXT NOT NULL REFERENCES users(id),created_at TEXT NOT NULL,updated_at TEXT NOT NULL,
 UNIQUE(tenant_id,id),UNIQUE(tenant_id,building_id,staircase,floor,title),FOREIGN KEY(tenant_id,building_id) REFERENCES buildings(tenant_id,id)
);
CREATE TABLE contacts (
 id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL REFERENCES tenants(id),title TEXT NOT NULL,email TEXT NOT NULL DEFAULT '',phone TEXT NOT NULL DEFAULT '',
 contact_type TEXT NOT NULL DEFAULT 'potenziale cliente' CHECK(contact_type IN ('proprietario','comproprietario','inquilino','acquirente','potenziale cliente','professionista')),
 do_not_contact INTEGER NOT NULL DEFAULT 0 CHECK(do_not_contact IN (0,1)),notes TEXT NOT NULL DEFAULT '',version INTEGER NOT NULL DEFAULT 1,
 created_by TEXT NOT NULL REFERENCES users(id),updated_by TEXT NOT NULL REFERENCES users(id),created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(tenant_id,id)
);
CREATE UNIQUE INDEX contacts_email_unique ON contacts(tenant_id,lower(email)) WHERE email<>'';
CREATE UNIQUE INDEX contacts_phone_unique ON contacts(tenant_id,phone) WHERE phone<>'';
CREATE TABLE properties (
 id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL REFERENCES tenants(id),title TEXT NOT NULL,unit_id TEXT,owner_id TEXT,price REAL NOT NULL DEFAULT 0 CHECK(price>=0),
 marketing_status TEXT NOT NULL DEFAULT 'preparazione' CHECK(marketing_status IN ('preparazione','in vendita','in affitto','in trattativa','venduto','locato')),
 notes TEXT NOT NULL DEFAULT '',version INTEGER NOT NULL DEFAULT 1,
 created_by TEXT NOT NULL REFERENCES users(id),updated_by TEXT NOT NULL REFERENCES users(id),created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(tenant_id,id),UNIQUE(tenant_id,unit_id),
 FOREIGN KEY(tenant_id,unit_id) REFERENCES units(tenant_id,id),FOREIGN KEY(tenant_id,owner_id) REFERENCES contacts(tenant_id,id)
);
CREATE TABLE activities (
 id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL REFERENCES tenants(id),title TEXT NOT NULL,agent_id TEXT NOT NULL,
 activity_type TEXT NOT NULL CHECK(activity_type IN ('chiamata','richiamo','porta a porta','censimento','acquisizione','appuntamento proprietario','visita acquirente','trattativa','follow-up')),
 priority TEXT NOT NULL DEFAULT 'normale' CHECK(priority IN ('bassa','normale','alta','urgente')),
 due_at TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pianificata' CHECK(status IN ('pianificata','in corso','completata','annullata')),
 goal INTEGER NOT NULL DEFAULT 1 CHECK(goal>0),progress INTEGER NOT NULL DEFAULT 0 CHECK(progress>=0 AND progress<=goal),
 outcome TEXT NOT NULL DEFAULT '',next_action TEXT NOT NULL DEFAULT '',street_id TEXT,building_id TEXT,unit_id TEXT,contact_id TEXT,property_id TEXT,
 notes TEXT NOT NULL DEFAULT '',version INTEGER NOT NULL DEFAULT 1,
 created_by TEXT NOT NULL REFERENCES users(id),updated_by TEXT NOT NULL REFERENCES users(id),created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(tenant_id,id),
 CHECK(status<>'completata' OR length(trim(outcome))>0),
 FOREIGN KEY(agent_id,tenant_id) REFERENCES memberships(user_id,tenant_id),
 FOREIGN KEY(tenant_id,street_id) REFERENCES streets(tenant_id,id),FOREIGN KEY(tenant_id,building_id) REFERENCES buildings(tenant_id,id),FOREIGN KEY(tenant_id,unit_id) REFERENCES units(tenant_id,id),FOREIGN KEY(tenant_id,contact_id) REFERENCES contacts(tenant_id,id),FOREIGN KEY(tenant_id,property_id) REFERENCES properties(tenant_id,id)
);
CREATE TABLE appointments (
 id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL REFERENCES tenants(id),title TEXT NOT NULL,agent_id TEXT NOT NULL,activity_id TEXT,
 starts_at TEXT NOT NULL,ends_at TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'da confermare' CHECK(status IN ('da confermare','confermato','effettuato','riprogrammato','saltato','annullato')),
 commercial_outcome TEXT NOT NULL DEFAULT '' CHECK(commercial_outcome IN ('','positivo','negativo','da valutare')),
 contact_id TEXT,property_id TEXT,notes TEXT NOT NULL DEFAULT '',version INTEGER NOT NULL DEFAULT 1,
 created_by TEXT NOT NULL REFERENCES users(id),updated_by TEXT NOT NULL REFERENCES users(id),created_at TEXT NOT NULL,updated_at TEXT NOT NULL,
 UNIQUE(tenant_id,id),UNIQUE(tenant_id,activity_id),CHECK(ends_at>starts_at),CHECK(commercial_outcome='' OR status='effettuato'),
 FOREIGN KEY(agent_id,tenant_id) REFERENCES memberships(user_id,tenant_id),FOREIGN KEY(tenant_id,activity_id) REFERENCES activities(tenant_id,id),FOREIGN KEY(tenant_id,contact_id) REFERENCES contacts(tenant_id,id),FOREIGN KEY(tenant_id,property_id) REFERENCES properties(tenant_id,id)
);
CREATE TABLE record_history(id INTEGER PRIMARY KEY,tenant_id TEXT NOT NULL REFERENCES tenants(id),entity TEXT NOT NULL,record_id TEXT NOT NULL,version INTEGER NOT NULL,snapshot TEXT NOT NULL,actor_id TEXT NOT NULL REFERENCES users(id),created_at TEXT NOT NULL);
CREATE INDEX activities_tenant_due ON activities(tenant_id,agent_id,due_at);
CREATE INDEX appointments_tenant_time ON appointments(tenant_id,agent_id,starts_at,ends_at);
CREATE INDEX history_tenant_record ON record_history(tenant_id,entity,record_id);
