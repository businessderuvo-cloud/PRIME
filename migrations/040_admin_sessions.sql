CREATE TABLE IF NOT EXISTS admin_sessions (token_hash TEXT PRIMARY KEY,email TEXT NOT NULL,csrf TEXT NOT NULL,expires INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS admin_sessions_expiry ON admin_sessions(expires);
