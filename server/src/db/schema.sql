-- ─────────────────────────────────────────────────────────────────────────────
-- ConnectHive Database Schema
-- Run via:  npm run db:migrate
-- ─────────────────────────────────────────────────────────────────────────────

-- UUID generation (pgcrypto ships with Neon/standard Postgres)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Users ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  user_id        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email          TEXT        UNIQUE NOT NULL,
  password_hash  TEXT        NOT NULL,
  account_status TEXT        NOT NULL DEFAULT 'active',
  last_login     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Profiles ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  profile_id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                UUID        UNIQUE NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  full_name              TEXT,
  age                    INT,
  location               TEXT,
  school_company         TEXT,
  bio                    TEXT,
  profile_photo_url      TEXT,
  interests              JSONB       NOT NULL DEFAULT '[]',
  skills                 JSONB       NOT NULL DEFAULT '[]',
  goals                  JSONB       NOT NULL DEFAULT '[]',
  availability           JSONB       NOT NULL DEFAULT '[]',
  personality_type       TEXT,
  connection_preference  TEXT,
  group_size_preference  TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Categories ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS categories (
  category_id    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  category_name  TEXT        UNIQUE NOT NULL,
  description    TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Hives ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hives (
  hive_id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_user_id        UUID        NOT NULL REFERENCES users(user_id),
  category_id            UUID        REFERENCES categories(category_id),
  hive_name              TEXT        NOT NULL,
  description            TEXT,
  ideal_members          TEXT,
  max_members            INT,
  activation_threshold   INT         NOT NULL DEFAULT 3,
  tags                   JSONB       NOT NULL DEFAULT '[]',
  join_policy            VARCHAR(10) NOT NULL DEFAULT 'open'
                           CHECK (join_policy IN ('open', 'request', 'invite')),
  discoverable           BOOLEAN     NOT NULL DEFAULT TRUE,
  location_type          TEXT        CHECK (location_type IN ('online', 'in-person', 'hybrid')),
  location               TEXT,
  pinned_goal            TEXT,
  ground_rules           TEXT,
  icebreaker             TEXT,
  hive_status            TEXT        NOT NULL DEFAULT 'active',
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Hive Members ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hive_members (
  hive_member_id    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  hive_id           UUID        NOT NULL REFERENCES hives(hive_id) ON DELETE CASCADE,
  user_id           UUID        NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  role              TEXT        NOT NULL DEFAULT 'member'
                      CHECK (role IN ('owner', 'admin', 'member')),
  membership_status TEXT        NOT NULL DEFAULT 'active',
  joined_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (hive_id, user_id)
);

-- ─── Join Requests ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS join_requests (
  request_id       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  hive_id          UUID        NOT NULL REFERENCES hives(hive_id) ON DELETE CASCADE,
  user_id          UUID        NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  request_message  TEXT,
  status           TEXT        NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'accepted', 'rejected')),
  requested_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at      TIMESTAMPTZ,
  reviewed_by      UUID        REFERENCES users(user_id),
  UNIQUE (hive_id, user_id)
);

-- ─── Messages ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
  message_id      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  hive_id         UUID        NOT NULL REFERENCES hives(hive_id) ON DELETE CASCADE,
  sender_user_id  UUID        NOT NULL REFERENCES users(user_id),
  message_text    TEXT        NOT NULL,
  message_status  TEXT        NOT NULL DEFAULT 'sent',
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Compatibility Scores ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS compatibility_scores (
  compatibility_id   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID         NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  hive_id            UUID         NOT NULL REFERENCES hives(hive_id) ON DELETE CASCADE,
  category_score     NUMERIC(5,2) NOT NULL DEFAULT 0,
  interest_score     NUMERIC(5,2) NOT NULL DEFAULT 0,
  skill_score        NUMERIC(5,2) NOT NULL DEFAULT 0,
  goal_score         NUMERIC(5,2) NOT NULL DEFAULT 0,
  location_score     NUMERIC(5,2) NOT NULL DEFAULT 0,
  availability_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  personality_score  NUMERIC(5,2) NOT NULL DEFAULT 0,
  total_score        NUMERIC(5,2) NOT NULL DEFAULT 0,
  calculated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, hive_id)
);

-- ─── Waitlist (cold-start / founder queue) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS waitlist (
  waitlist_id  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  category_id  UUID        REFERENCES categories(category_id),
  location     TEXT,
  status       TEXT        NOT NULL DEFAULT 'waiting',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_profiles_user_id          ON profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_hives_creator             ON hives(creator_user_id);
CREATE INDEX IF NOT EXISTS idx_hives_category            ON hives(category_id);
CREATE INDEX IF NOT EXISTS idx_hive_members_hive         ON hive_members(hive_id);
CREATE INDEX IF NOT EXISTS idx_hive_members_user         ON hive_members(user_id);
CREATE INDEX IF NOT EXISTS idx_join_requests_hive        ON join_requests(hive_id);
CREATE INDEX IF NOT EXISTS idx_join_requests_user        ON join_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_hive_sent        ON messages(hive_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_compat_user               ON compatibility_scores(user_id);
CREATE INDEX IF NOT EXISTS idx_compat_hive               ON compatibility_scores(hive_id);
CREATE INDEX IF NOT EXISTS idx_waitlist_category         ON waitlist(category_id);
