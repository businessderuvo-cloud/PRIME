ALTER TABLE trustpilot_rewards ADD COLUMN automation_state TEXT NOT NULL DEFAULT 'manual_review';
ALTER TABLE trustpilot_rewards ADD COLUMN provider_reference TEXT;
ALTER TABLE trustpilot_rewards ADD COLUMN automation_started_at INTEGER;
ALTER TABLE trustpilot_rewards ADD COLUMN automation_error TEXT;
