ALTER TABLE users ADD COLUMN theme_variant TEXT NOT NULL DEFAULT '' CHECK(theme_variant IN ('','vip','pro'));
