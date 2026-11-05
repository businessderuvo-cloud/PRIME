ALTER TABLE cpay_orders ADD COLUMN reward_discount_cents INTEGER NOT NULL DEFAULT 0 CHECK(reward_discount_cents>=0);
CREATE UNIQUE INDEX cpay_one_review_discount ON cpay_orders(tenant_id) WHERE reward_discount_cents>0 AND state IN ('creating','pending','paid');
