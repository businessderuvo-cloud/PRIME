CREATE TABLE telephony_settings_telnyx (
 tenant_id TEXT NOT NULL REFERENCES tenants(id),
 provider TEXT NOT NULL CHECK(provider IN ('telnyx')),
 credentials_cipher TEXT NOT NULL,
 phone_number TEXT NOT NULL,
 sip TEXT NOT NULL DEFAULT '',
 verified_at TEXT NOT NULL,
 demo INTEGER NOT NULL DEFAULT 0 CHECK(demo IN (0,1)),
 updated_by TEXT NOT NULL REFERENCES users(id),
 PRIMARY KEY(tenant_id,provider)
);
INSERT INTO telephony_settings_telnyx SELECT tenant_id,'telnyx',credentials_cipher,phone_number,sip,verified_at,demo,updated_by FROM telephony_settings WHERE provider='telnyx';
DROP TABLE telephony_settings;
ALTER TABLE telephony_settings_telnyx RENAME TO telephony_settings;
