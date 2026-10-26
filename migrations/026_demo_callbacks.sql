CREATE TABLE demo_callbacks(id TEXT PRIMARY KEY, phone_hash TEXT NOT NULL, ip_hash TEXT NOT NULL, created_ms INTEGER NOT NULL, state TEXT NOT NULL);
CREATE INDEX demo_callbacks_created ON demo_callbacks(created_ms);
