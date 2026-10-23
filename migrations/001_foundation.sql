CREATE TABLE IF NOT EXISTS tenants(id TEXT PRIMARY KEY,name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,password TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS memberships(user_id TEXT REFERENCES users(id),tenant_id TEXT REFERENCES tenants(id),role TEXT CHECK(role IN ('owner','admin','agent','viewer')),PRIMARY KEY(user_id,tenant_id));
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),tenant_id TEXT REFERENCES tenants(id),expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS records(id TEXT PRIMARY KEY,tenant_id TEXT REFERENCES tenants(id),kind TEXT NOT NULL,title TEXT NOT NULL,body TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS records_tenant_kind ON records(tenant_id,kind);
CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY,tenant_id TEXT,user_id TEXT,action TEXT,record_id TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
