ALTER TABLE units ADD COLUMN has_garage INTEGER NOT NULL DEFAULT 0 CHECK(has_garage IN (0,1));
ALTER TABLE buyer_profiles ADD COLUMN operation_type TEXT NOT NULL DEFAULT 'vendita' CHECK(operation_type IN ('vendita','locazione','indifferente'));
