CREATE TABLE buyer_profiles (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id), title TEXT NOT NULL,
 contact_id TEXT NOT NULL, assigned_agent_id TEXT, budget_min REAL NOT NULL DEFAULT 0 CHECK(budget_min>=0), budget_max REAL NOT NULL DEFAULT 0 CHECK(budget_max>=0),
 preferred_areas TEXT NOT NULL DEFAULT '', min_area REAL NOT NULL DEFAULT 0 CHECK(min_area>=0), min_rooms INTEGER NOT NULL DEFAULT 0 CHECK(min_rooms>=0), preferred_floor TEXT NOT NULL DEFAULT '',
 needs_garage INTEGER NOT NULL DEFAULT 0 CHECK(needs_garage IN (0,1)), requirements TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'attiva' CHECK(status IN ('attiva','in pausa','soddisfatta','archiviata')),
 notes TEXT NOT NULL DEFAULT '', version INTEGER NOT NULL DEFAULT 1, created_by TEXT NOT NULL REFERENCES users(id), updated_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 UNIQUE(tenant_id,id), FOREIGN KEY(tenant_id,contact_id) REFERENCES contacts(tenant_id,id), FOREIGN KEY(assigned_agent_id,tenant_id) REFERENCES memberships(user_id,tenant_id), CHECK(budget_max=0 OR budget_min<=budget_max)
);
CREATE INDEX buyer_profiles_tenant_status ON buyer_profiles(tenant_id,status,assigned_agent_id);

CREATE TABLE deals (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id), title TEXT NOT NULL, property_id TEXT NOT NULL, contact_id TEXT, assigned_agent_id TEXT,
 stage TEXT NOT NULL DEFAULT 'valutazione' CHECK(stage IN ('valutazione','acquisizione','incarico','visite','proposta','controproposta','preliminare','rogito','conclusa','persa')),
 deal_type TEXT NOT NULL DEFAULT 'vendita' CHECK(deal_type IN ('vendita','locazione')), expected_value REAL NOT NULL DEFAULT 0 CHECK(expected_value>=0), next_deadline TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'aperta' CHECK(status IN ('aperta','in attesa','vinta','persa','annullata')), notes TEXT NOT NULL DEFAULT '', version INTEGER NOT NULL DEFAULT 1,
 created_by TEXT NOT NULL REFERENCES users(id), updated_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(tenant_id,id),
 FOREIGN KEY(tenant_id,property_id) REFERENCES properties(tenant_id,id), FOREIGN KEY(tenant_id,contact_id) REFERENCES contacts(tenant_id,id), FOREIGN KEY(assigned_agent_id,tenant_id) REFERENCES memberships(user_id,tenant_id)
);
CREATE INDEX deals_tenant_stage ON deals(tenant_id,status,stage,assigned_agent_id);

CREATE TABLE offers (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id), title TEXT NOT NULL, deal_id TEXT NOT NULL, contact_id TEXT NOT NULL,
 amount REAL NOT NULL CHECK(amount>=0), deposit REAL NOT NULL DEFAULT 0 CHECK(deposit>=0), offer_type TEXT NOT NULL DEFAULT 'proposta' CHECK(offer_type IN ('proposta','controproposta')),
 status TEXT NOT NULL DEFAULT 'bozza' CHECK(status IN ('bozza','presentata','accettata','rifiutata','scaduta','ritirata')), valid_until TEXT NOT NULL DEFAULT '', conditions TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
 version INTEGER NOT NULL DEFAULT 1, created_by TEXT NOT NULL REFERENCES users(id), updated_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(tenant_id,id),
 FOREIGN KEY(tenant_id,deal_id) REFERENCES deals(tenant_id,id), FOREIGN KEY(tenant_id,contact_id) REFERENCES contacts(tenant_id,id)
);
CREATE INDEX offers_tenant_deal ON offers(tenant_id,deal_id,status);

CREATE TABLE valuations (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id), title TEXT NOT NULL, property_id TEXT NOT NULL, contact_id TEXT, agent_id TEXT NOT NULL,
 assessed_on TEXT NOT NULL, low_value REAL NOT NULL DEFAULT 0 CHECK(low_value>=0), high_value REAL NOT NULL DEFAULT 0 CHECK(high_value>=0), market_price_m2 REAL NOT NULL DEFAULT 0 CHECK(market_price_m2>=0),
 source TEXT NOT NULL DEFAULT '', limitations TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'bozza' CHECK(status IN ('bozza','condivisa','approvata','archiviata')), notes TEXT NOT NULL DEFAULT '', version INTEGER NOT NULL DEFAULT 1,
 created_by TEXT NOT NULL REFERENCES users(id), updated_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(tenant_id,id),
 FOREIGN KEY(tenant_id,property_id) REFERENCES properties(tenant_id,id), FOREIGN KEY(tenant_id,contact_id) REFERENCES contacts(tenant_id,id), FOREIGN KEY(agent_id,tenant_id) REFERENCES memberships(user_id,tenant_id), CHECK(high_value=0 OR low_value<=high_value)
);

CREATE TABLE leases (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id), title TEXT NOT NULL, property_id TEXT NOT NULL, tenant_contact_id TEXT, owner_contact_id TEXT,
 rent_monthly REAL NOT NULL DEFAULT 0 CHECK(rent_monthly>=0), deposit REAL NOT NULL DEFAULT 0 CHECK(deposit>=0), starts_on TEXT NOT NULL DEFAULT '', ends_on TEXT NOT NULL DEFAULT '', renewal_on TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'in preparazione' CHECK(status IN ('in preparazione','attiva','in rinnovo','disdetta','conclusa')), notes TEXT NOT NULL DEFAULT '', version INTEGER NOT NULL DEFAULT 1,
 created_by TEXT NOT NULL REFERENCES users(id), updated_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(tenant_id,id),
 FOREIGN KEY(tenant_id,property_id) REFERENCES properties(tenant_id,id), FOREIGN KEY(tenant_id,tenant_contact_id) REFERENCES contacts(tenant_id,id), FOREIGN KEY(tenant_id,owner_contact_id) REFERENCES contacts(tenant_id,id), CHECK(ends_on='' OR starts_on='' OR starts_on<=ends_on)
);
CREATE INDEX leases_tenant_status ON leases(tenant_id,status,ends_on);

CREATE TABLE commissions (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id), title TEXT NOT NULL, deal_id TEXT NOT NULL, agent_id TEXT,
 basis_amount REAL NOT NULL DEFAULT 0 CHECK(basis_amount>=0), percentage REAL NOT NULL DEFAULT 0 CHECK(percentage>=0 AND percentage<=100), agency_share REAL NOT NULL DEFAULT 0 CHECK(agency_share>=0), agent_share REAL NOT NULL DEFAULT 0 CHECK(agent_share>=0),
 expected_amount REAL NOT NULL DEFAULT 0 CHECK(expected_amount>=0), accrued_amount REAL NOT NULL DEFAULT 0 CHECK(accrued_amount>=0), invoiced_amount REAL NOT NULL DEFAULT 0 CHECK(invoiced_amount>=0), collected_amount REAL NOT NULL DEFAULT 0 CHECK(collected_amount>=0),
 status TEXT NOT NULL DEFAULT 'prevista' CHECK(status IN ('prevista','maturata','fatturata','parzialmente incassata','incassata')), notes TEXT NOT NULL DEFAULT '', version INTEGER NOT NULL DEFAULT 1,
 created_by TEXT NOT NULL REFERENCES users(id), updated_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(tenant_id,id),
 FOREIGN KEY(tenant_id,deal_id) REFERENCES deals(tenant_id,id), FOREIGN KEY(agent_id,tenant_id) REFERENCES memberships(user_id,tenant_id)
);

CREATE TABLE documents (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id), title TEXT NOT NULL, property_id TEXT, contact_id TEXT, deal_id TEXT,
 document_type TEXT NOT NULL DEFAULT 'altro' CHECK(document_type IN ('incarico','proposta','controproposta','contratto','APE','planimetria','documento catastale','altro')),
 file_name TEXT NOT NULL DEFAULT '', file_reference TEXT NOT NULL DEFAULT '', expires_on TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'da caricare' CHECK(status IN ('da caricare','disponibile','scaduto','archiviato')),
 notes TEXT NOT NULL DEFAULT '', version INTEGER NOT NULL DEFAULT 1, created_by TEXT NOT NULL REFERENCES users(id), updated_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(tenant_id,id),
 FOREIGN KEY(tenant_id,property_id) REFERENCES properties(tenant_id,id), FOREIGN KEY(tenant_id,contact_id) REFERENCES contacts(tenant_id,id), FOREIGN KEY(tenant_id,deal_id) REFERENCES deals(tenant_id,id)
);
CREATE INDEX documents_tenant_expiry ON documents(tenant_id,status,expires_on);

CREATE TABLE signature_requests (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id), title TEXT NOT NULL, document_id TEXT NOT NULL, signer_contact_id TEXT NOT NULL,
 provider TEXT NOT NULL DEFAULT 'InfoCert' CHECK(provider IN ('InfoCert','Namirial','DocuSign','Dropbox Sign','Adobe Acrobat Sign')),
 signature_level TEXT NOT NULL DEFAULT 'da definire' CHECK(signature_level IN ('da definire','semplice','avanzata','qualificata (QES)')),
 status TEXT NOT NULL DEFAULT 'da configurare' CHECK(status IN ('da configurare','bozza','in attesa provider','inviata','firmata','rifiutata','scaduta','errore')),
 provider_envelope_id TEXT NOT NULL DEFAULT '', sent_at TEXT NOT NULL DEFAULT '', signed_at TEXT NOT NULL DEFAULT '', expires_at TEXT NOT NULL DEFAULT '', audit_reference TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', version INTEGER NOT NULL DEFAULT 1,
 created_by TEXT NOT NULL REFERENCES users(id), updated_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(tenant_id,id),
 FOREIGN KEY(tenant_id,document_id) REFERENCES documents(tenant_id,id), FOREIGN KEY(tenant_id,signer_contact_id) REFERENCES contacts(tenant_id,id)
);
CREATE INDEX signature_requests_tenant_status ON signature_requests(tenant_id,status,provider);

CREATE TABLE viewing_feedback (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id), title TEXT NOT NULL, appointment_id TEXT NOT NULL, contact_id TEXT NOT NULL, property_id TEXT NOT NULL, agent_id TEXT NOT NULL, visited_at TEXT NOT NULL,
 outcome TEXT NOT NULL DEFAULT 'da valutare' CHECK(outcome IN ('positivo','negativo','da valutare')), liked TEXT NOT NULL DEFAULT '', disliked TEXT NOT NULL DEFAULT '', rejection_reason TEXT NOT NULL DEFAULT '',
 second_visit TEXT NOT NULL DEFAULT 'da valutare' CHECK(second_visit IN ('da valutare','sì','no')), follow_up_at TEXT NOT NULL DEFAULT '', preference_update TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', version INTEGER NOT NULL DEFAULT 1,
 created_by TEXT NOT NULL REFERENCES users(id), updated_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(tenant_id,id), UNIQUE(tenant_id,appointment_id),
 FOREIGN KEY(tenant_id,appointment_id) REFERENCES appointments(tenant_id,id), FOREIGN KEY(tenant_id,contact_id) REFERENCES contacts(tenant_id,id), FOREIGN KEY(tenant_id,property_id) REFERENCES properties(tenant_id,id), FOREIGN KEY(agent_id,tenant_id) REFERENCES memberships(user_id,tenant_id)
);
CREATE INDEX viewing_feedback_tenant_contact ON viewing_feedback(tenant_id,contact_id,visited_at);
