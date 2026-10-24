ALTER TABLE units ADD COLUMN lead_temperature TEXT NOT NULL DEFAULT 'non indicata' CHECK(lead_temperature IN ('non indicata','freddo','tiepido','caldo'));
ALTER TABLE contacts ADD COLUMN lead_temperature TEXT NOT NULL DEFAULT 'non indicata' CHECK(lead_temperature IN ('non indicata','freddo','tiepido','caldo'));
