ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 1 CHECK(email_verified IN (0,1));
ALTER TABLE users ADD COLUMN totp_enabled INTEGER NOT NULL DEFAULT 0 CHECK(totp_enabled IN (0,1));
ALTER TABLE users ADD COLUMN totp_secret_cipher TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN totp_pending_cipher TEXT NOT NULL DEFAULT '';

CREATE TABLE auth_tokens (
 token_hash TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 purpose TEXT NOT NULL CHECK(purpose IN ('verify_email','password_reset','agent_invite')),
 expires_at INTEGER NOT NULL,
 created_at TEXT NOT NULL
);
CREATE INDEX auth_tokens_expiry ON auth_tokens(expires_at);

CREATE TABLE auth_challenges (
 token_hash TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
 expires_at INTEGER NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts>=0),
 created_at TEXT NOT NULL
);
CREATE INDEX auth_challenges_expiry ON auth_challenges(expires_at);
