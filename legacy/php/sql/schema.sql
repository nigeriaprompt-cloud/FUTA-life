-- FUTA World onboarding tables. Works on SQLite (dev) and MySQL (change AUTOINCREMENT → AUTO_INCREMENT).
-- If your social-commerce site already has a users table, keep it and add only `world_players` + `auth_identities`
-- (see docs/DATA_MODEL.md): world_players.user_id points at your existing users.id.
CREATE TABLE IF NOT EXISTS world_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE,
  password_hash TEXT,                 -- NULL for Google-only accounts
  google_sub TEXT UNIQUE,             -- Google's stable user id
  username TEXT UNIQUE,               -- lower-case, 3-20 chars [a-z0-9_]
  dob TEXT,                           -- YYYY-MM-DD
  is_teen INTEGER NOT NULL DEFAULT 0, -- computed server-side from dob
  avatar_json TEXT,                   -- cleaned look (AvatarValidator), schema v1
  life_start TEXT,                    -- 'fresh' | 'hustler' | 'creative'
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
