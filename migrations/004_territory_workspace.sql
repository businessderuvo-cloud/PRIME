ALTER TABLE appointments ADD COLUMN appointment_type TEXT NOT NULL DEFAULT 'altro' CHECK(appointment_type IN ('1ª visita immobile','2ª visita immobile','servizio fotografico immobile','appuntamento con proprietario','altro'));
ALTER TABLE units ADD COLUMN property_type TEXT NOT NULL DEFAULT '';
ALTER TABLE units ADD COLUMN condition TEXT NOT NULL DEFAULT '';
ALTER TABLE contacts ADD COLUMN profession TEXT NOT NULL DEFAULT '';
ALTER TABLE contacts ADD COLUMN marital_status TEXT NOT NULL DEFAULT 'non indicato' CHECK(marital_status IN ('non indicato','celibe / nubile','coniugato/a','convivente','separato/a','divorziato/a','vedovo/a'));
ALTER TABLE contacts ADD COLUMN has_children TEXT NOT NULL DEFAULT 'non indicato' CHECK(has_children IN ('non indicato','sì','no'));
ALTER TABLE contacts ADD COLUMN preferred_channel TEXT NOT NULL DEFAULT 'non indicato' CHECK(preferred_channel IN ('non indicato','telefono','WhatsApp','email','SMS','social'));
ALTER TABLE contacts ADD COLUMN preferred_days TEXT NOT NULL DEFAULT '';
ALTER TABLE contacts ADD COLUMN preferred_time_from TEXT NOT NULL DEFAULT '';
ALTER TABLE contacts ADD COLUMN preferred_time_to TEXT NOT NULL DEFAULT '';
ALTER TABLE contacts ADD COLUMN preference_notes TEXT NOT NULL DEFAULT '';
ALTER TABLE contacts ADD COLUMN info_source TEXT NOT NULL DEFAULT '';
ALTER TABLE contacts ADD COLUMN verified_on TEXT NOT NULL DEFAULT '';

CREATE TABLE unit_contacts(
 id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL REFERENCES tenants(id),title TEXT NOT NULL,
 unit_id TEXT NOT NULL,contact_id TEXT NOT NULL,
 relationship TEXT NOT NULL CHECK(relationship IN ('proprietario','comproprietario','inquilino','occupante','delegato','altro interlocutore')),
 notes TEXT NOT NULL DEFAULT '',version INTEGER NOT NULL DEFAULT 1,
 created_by TEXT NOT NULL REFERENCES users(id),updated_by TEXT NOT NULL REFERENCES users(id),created_at TEXT NOT NULL,updated_at TEXT NOT NULL,
 UNIQUE(tenant_id,id),UNIQUE(tenant_id,unit_id,contact_id,relationship),
 FOREIGN KEY(tenant_id,unit_id) REFERENCES units(tenant_id,id),FOREIGN KEY(tenant_id,contact_id) REFERENCES contacts(tenant_id,id)
);
CREATE TABLE contact_methods(
 id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL REFERENCES tenants(id),title TEXT NOT NULL,
 contact_id TEXT NOT NULL,method_type TEXT NOT NULL CHECK(method_type IN ('telefono','email','WhatsApp','Facebook','Instagram','LinkedIn','altro social','altro recapito')),
 value TEXT NOT NULL,notes TEXT NOT NULL DEFAULT '',version INTEGER NOT NULL DEFAULT 1,
 created_by TEXT NOT NULL REFERENCES users(id),updated_by TEXT NOT NULL REFERENCES users(id),created_at TEXT NOT NULL,updated_at TEXT NOT NULL,
 UNIQUE(tenant_id,id),UNIQUE(tenant_id,contact_id,method_type,value),FOREIGN KEY(tenant_id,contact_id) REFERENCES contacts(tenant_id,id)
);
CREATE TABLE contact_interactions(
 id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL REFERENCES tenants(id),title TEXT NOT NULL,
 street_id TEXT,building_id TEXT,unit_id TEXT,contact_id TEXT,
 channel TEXT NOT NULL CHECK(channel IN ('chiamata','telemarketing','porta a porta','email','WhatsApp','social','altro')),
 occurred_at TEXT NOT NULL,outcome TEXT NOT NULL CHECK(outcome IN ('da richiamare','non risponde','interessato','non interessato','in vendita','non in vendita','in affitto','informazioni aggiornate','altro')),
 next_action TEXT NOT NULL DEFAULT '',follow_up_at TEXT NOT NULL DEFAULT '',notes TEXT NOT NULL DEFAULT '',version INTEGER NOT NULL DEFAULT 1,
 created_by TEXT NOT NULL REFERENCES users(id),updated_by TEXT NOT NULL REFERENCES users(id),created_at TEXT NOT NULL,updated_at TEXT NOT NULL,
 UNIQUE(tenant_id,id),CHECK(street_id IS NOT NULL OR building_id IS NOT NULL OR unit_id IS NOT NULL OR contact_id IS NOT NULL),
 FOREIGN KEY(tenant_id,street_id) REFERENCES streets(tenant_id,id),FOREIGN KEY(tenant_id,building_id) REFERENCES buildings(tenant_id,id),FOREIGN KEY(tenant_id,unit_id) REFERENCES units(tenant_id,id),FOREIGN KEY(tenant_id,contact_id) REFERENCES contacts(tenant_id,id)
);
CREATE INDEX interactions_territory_time ON contact_interactions(tenant_id,unit_id,building_id,street_id,occurred_at);
CREATE TABLE media(
 id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL REFERENCES tenants(id),building_id TEXT,unit_id TEXT,
 photo_type TEXT NOT NULL CHECK(photo_type IN ('citofono','appartamento')),mime_type TEXT NOT NULL,extension TEXT NOT NULL,size_bytes INTEGER NOT NULL,
 created_by TEXT NOT NULL REFERENCES users(id),created_at TEXT NOT NULL,
 CHECK((building_id IS NOT NULL AND unit_id IS NULL AND photo_type='citofono') OR (unit_id IS NOT NULL AND building_id IS NULL AND photo_type='appartamento')),
 FOREIGN KEY(tenant_id,building_id) REFERENCES buildings(tenant_id,id),FOREIGN KEY(tenant_id,unit_id) REFERENCES units(tenant_id,id)
);
CREATE INDEX media_territory ON media(tenant_id,building_id,unit_id);
