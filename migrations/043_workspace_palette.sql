-- Keep the original VIP preference readable during a rolling release.
ALTER TABLE users ADD COLUMN workspace_palette TEXT NOT NULL DEFAULT '' CHECK(workspace_palette IN ('','pro','vip','elite','secret'));
UPDATE users SET workspace_palette=theme_variant WHERE theme_variant<>'';
