CREATE TABLE agency_document_expiries (
 session_id TEXT NOT NULL REFERENCES didit_kyb_sessions(id) ON DELETE CASCADE,
 document_key TEXT NOT NULL,
 expires_on TEXT NOT NULL,
 PRIMARY KEY (session_id,document_key)
);
