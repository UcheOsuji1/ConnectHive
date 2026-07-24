-- ─────────────────────────────────────────────────────────────────────────────
-- ConnectHive Database Schema
-- Run via:  npm run db:migrate
-- ─────────────────────────────────────────────────────────────────────────────

-- UUID generation (pgcrypto ships with Neon/standard Postgres)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Member ID sequence (CHV-YYYY-NNNNN) ─────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS chv_member_seq;

-- ─── Users ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  user_id        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email          TEXT        UNIQUE NOT NULL,
  member_id      TEXT        UNIQUE NOT NULL DEFAULT
                               'CHV-' || TO_CHAR(NOW(), 'YYYY') || '-' ||
                               LPAD(NEXTVAL('chv_member_seq')::TEXT, 5, '0'),
  password_hash  TEXT        NOT NULL,
  account_status TEXT        NOT NULL DEFAULT 'active',
  last_login     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Idempotent: add member_id to existing live tables and backfill each row
-- (NEXTVAL is volatile, so Postgres evaluates it once per existing row)
ALTER TABLE users ADD COLUMN IF NOT EXISTS member_id TEXT DEFAULT
  'CHV-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(nextval('chv_member_seq')::TEXT, 5, '0');
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_member_id ON users(member_id);

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
  connection_purposes    JSONB       NOT NULL DEFAULT '[]',
  social_preferences     JSONB       NOT NULL DEFAULT '{}',
  group_size_preference  TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Idempotent column additions for databases created before these columns existed
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS connection_purposes JSONB NOT NULL DEFAULT '[]';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS social_preferences  JSONB NOT NULL DEFAULT '{}';

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
  cadence                TEXT,
  hive_status            TEXT        NOT NULL DEFAULT 'active',
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE hives ADD COLUMN IF NOT EXISTS cadence TEXT;

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

-- ─── Hive Followers (follow without joining) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS hive_followers (
  follower_id  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  hive_id      UUID        NOT NULL REFERENCES hives(hive_id) ON DELETE CASCADE,
  user_id      UUID        NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  followed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
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

-- ─── Hive Posts ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hive_posts (
  post_id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  hive_id         UUID        NOT NULL REFERENCES hives(hive_id) ON DELETE CASCADE,
  author_user_id  UUID        NOT NULL REFERENCES users(user_id),
  post_type       TEXT        NOT NULL DEFAULT 'update'
                    CHECK (post_type IN ('update', 'event')),
  headline        TEXT        NOT NULL,
  body            TEXT,
  media_url       TEXT,
  event_at        TIMESTAMPTZ,
  event_location  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Post Reactions ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS post_reactions (
  reaction_id  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id      UUID        NOT NULL REFERENCES hive_posts(post_id) ON DELETE CASCADE,
  user_id      UUID        NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  reaction     TEXT        NOT NULL DEFAULT 'like',
  reacted_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (post_id, user_id)
);

-- ─── Post Comments ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS post_comments (
  comment_id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id            UUID        NOT NULL REFERENCES hive_posts(post_id) ON DELETE CASCADE,
  user_id            UUID        NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  parent_comment_id  UUID        REFERENCES post_comments(comment_id) ON DELETE CASCADE,
  body               TEXT        NOT NULL,
  commented_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE post_comments ADD COLUMN IF NOT EXISTS
  parent_comment_id UUID REFERENCES post_comments(comment_id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_comments_parent ON post_comments(parent_comment_id);

-- ─── Pairwise User Compatibility Cache ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_compatibility (
  pair_id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a             UUID         NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  user_b             UUID         NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  interests_score    NUMERIC(5,2) NOT NULL DEFAULT 0,
  goals_score        NUMERIC(5,2) NOT NULL DEFAULT 0,
  personality_score  NUMERIC(5,2) NOT NULL DEFAULT 0,
  availability_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  age_score          NUMERIC(5,2) NOT NULL DEFAULT 0,
  total_score        NUMERIC(5,2) NOT NULL DEFAULT 0,
  calculated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CHECK (user_a < user_b),
  UNIQUE (user_a, user_b)
);
ALTER TABLE user_compatibility ADD COLUMN IF NOT EXISTS interests_score    NUMERIC(5,2) NOT NULL DEFAULT 0;
ALTER TABLE user_compatibility ADD COLUMN IF NOT EXISTS goals_score        NUMERIC(5,2) NOT NULL DEFAULT 0;
ALTER TABLE user_compatibility ADD COLUMN IF NOT EXISTS personality_score  NUMERIC(5,2) NOT NULL DEFAULT 0;
ALTER TABLE user_compatibility ADD COLUMN IF NOT EXISTS availability_score NUMERIC(5,2) NOT NULL DEFAULT 0;
ALTER TABLE user_compatibility ADD COLUMN IF NOT EXISTS age_score          NUMERIC(5,2) NOT NULL DEFAULT 0;
ALTER TABLE user_compatibility ADD COLUMN IF NOT EXISTS total_score        NUMERIC(5,2) NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_user_compat_a ON user_compatibility(user_a);
CREATE INDEX IF NOT EXISTS idx_user_compat_b ON user_compatibility(user_b);

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
CREATE INDEX IF NOT EXISTS idx_hive_followers_hive       ON hive_followers(hive_id);
CREATE INDEX IF NOT EXISTS idx_hive_followers_user       ON hive_followers(user_id);
CREATE INDEX IF NOT EXISTS idx_posts_hive                ON hive_posts(hive_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_author              ON hive_posts(author_user_id);
CREATE INDEX IF NOT EXISTS idx_reactions_post            ON post_reactions(post_id);
CREATE INDEX IF NOT EXISTS idx_comments_post             ON post_comments(post_id, commented_at);

-- ─── Allow milestone + welcome posts (idempotent — drop old constraint, add new) ─
ALTER TABLE hive_posts DROP CONSTRAINT IF EXISTS hive_posts_post_type_check;
ALTER TABLE hive_posts ADD CONSTRAINT hive_posts_post_type_check
  CHECK (post_type IN ('update', 'event', 'milestone', 'welcome'));

-- ─── Notifications ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  notification_id  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  type             TEXT        NOT NULL,
  title            TEXT        NOT NULL,
  body             TEXT,
  hive_id          UUID        REFERENCES hives(hive_id) ON DELETE SET NULL,
  actor_user_id    UUID        REFERENCES users(user_id) ON DELETE SET NULL,
  link             TEXT,
  read             BOOLEAN     NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC);

-- ─── Join ceremony — first-open welcome flag ────────────────────────────────
ALTER TABLE hive_members ADD COLUMN IF NOT EXISTS welcome_seen_at TIMESTAMPTZ NULL;
-- Backfill all pre-existing members so they do not see the takeover unexpectedly.
-- New members accepted after this migration will have welcome_seen_at = NULL until
-- they click "Enter Hive" on the takeover.
UPDATE hive_members SET welcome_seen_at = NOW() WHERE welcome_seen_at IS NULL;

-- ─── Hive last-seen tracking ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hive_last_seen (
  user_id      UUID        NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  hive_id      UUID        NOT NULL REFERENCES hives(hive_id) ON DELETE CASCADE,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, hive_id)
);
CREATE INDEX IF NOT EXISTS idx_hive_last_seen_user ON hive_last_seen(user_id);

-- ─── Phase 2: Member Onboarding Engine ───────────────────────────────────────

-- One row per hive; created lazily on first settings access
CREATE TABLE IF NOT EXISTS hive_onboarding_settings (
  hive_id              UUID        PRIMARY KEY REFERENCES hives(hive_id) ON DELETE CASCADE,
  join_experience      TEXT        NOT NULL DEFAULT 'standard'
                         CHECK (join_experience IN ('simple', 'standard', 'guided')),
  welcome_message      TEXT,
  show_welcome_banner  BOOLEAN     NOT NULL DEFAULT TRUE,
  show_owner_note      BOOLEAN     NOT NULL DEFAULT TRUE,
  require_photo        BOOLEAN     NOT NULL DEFAULT FALSE,
  send_welcome_notif   BOOLEAN     NOT NULL DEFAULT TRUE,
  completion_unlocks   BOOLEAN     NOT NULL DEFAULT FALSE,
  steps_seeded         BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ordered checklist steps per hive; seeded lazily with 6 defaults on first GET
CREATE TABLE IF NOT EXISTS hive_onboarding_steps (
  step_id      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  hive_id      UUID        NOT NULL REFERENCES hives(hive_id) ON DELETE CASCADE,
  title        TEXT        NOT NULL,
  description  TEXT,
  is_required  BOOLEAN     NOT NULL DEFAULT TRUE,
  step_order   INT         NOT NULL DEFAULT 0,
  step_type    TEXT        NOT NULL DEFAULT 'task'
                 CHECK (step_type IN ('task', 'link', 'read')),
  link_url     TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_onboarding_steps_hive
  ON hive_onboarding_steps(hive_id, step_order);

-- One row per (hive, user, step) when the member marks a step done
CREATE TABLE IF NOT EXISTS member_onboarding_progress (
  progress_id   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  hive_id       UUID        NOT NULL REFERENCES hives(hive_id)             ON DELETE CASCADE,
  user_id       UUID        NOT NULL REFERENCES users(user_id)              ON DELETE CASCADE,
  step_id       UUID        NOT NULL REFERENCES hive_onboarding_steps(step_id) ON DELETE CASCADE,
  completed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (hive_id, user_id, step_id)
);
CREATE INDEX IF NOT EXISTS idx_onboarding_progress_member
  ON member_onboarding_progress(hive_id, user_id);

-- Onboarding lifecycle columns on hive_members
-- Default 'completed' so all pre-existing members are treated as done
ALTER TABLE hive_members ADD COLUMN IF NOT EXISTS onboarding_status
  TEXT NOT NULL DEFAULT 'completed';
ALTER TABLE hive_members ADD COLUMN IF NOT EXISTS onboarding_started_at   TIMESTAMPTZ;
ALTER TABLE hive_members ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;

-- Allow completion-celebration posts
ALTER TABLE hive_posts DROP CONSTRAINT IF EXISTS hive_posts_post_type_check;
ALTER TABLE hive_posts ADD CONSTRAINT hive_posts_post_type_check
  CHECK (post_type IN ('update', 'event', 'milestone', 'welcome', 'completion'));
