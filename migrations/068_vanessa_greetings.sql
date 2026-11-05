CREATE TABLE vanessa_name_days (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  month_day TEXT NOT NULL CHECK (length(month_day) = 5)
);

CREATE TABLE vanessa_greeting_days (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('chat', 'voice')),
  local_date TEXT NOT NULL CHECK (length(local_date) = 10),
  PRIMARY KEY (user_id, channel)
);
