ALTER TABLE units ADD COLUMN is_hot_lead INTEGER NOT NULL DEFAULT 0 CHECK(is_hot_lead IN (0,1));
ALTER TABLE contacts ADD COLUMN is_hot_lead INTEGER NOT NULL DEFAULT 0 CHECK(is_hot_lead IN (0,1));
UPDATE units SET is_hot_lead = CASE WHEN lead_temperature = 'caldo' THEN 1 ELSE 0 END;
UPDATE contacts SET is_hot_lead = CASE WHEN lead_temperature = 'caldo' THEN 1 ELSE 0 END;
ALTER TABLE units DROP COLUMN lead_temperature;
ALTER TABLE contacts DROP COLUMN lead_temperature;
