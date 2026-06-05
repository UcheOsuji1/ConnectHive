-- ConnectHive Database Schema

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Users ───────────────────────────────────────────────────
CREATE TABLE users (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email       TEXT UNIQUE NOT NULL,
  password    TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Profiles ────────────────────────────────────────────────
CREATE TABLE profiles (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  display_name  TEXT NOT NULL,
  bio           TEXT,
  avatar_url    TEXT,
  location      TEXT,
  age           INT,
  occupation    TEXT,
  -- availability: JSON array of time slots (e.g. ["weekday_evenings","weekends"])
  availability  JSONB DEFAULT '[]',
  -- interests: JSON array of interest tags
  interests     JSONB DEFAULT '[]',
  -- personality: JSON object (e.g. {"type":"INTJ","energy":"introvert"})
  personality   JSONB DEFAULT '{}',
  setup_complete BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Categories ──────────────────────────────────────────────
CREATE TABLE categories (
  id    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug  TEXT UNIQUE NOT NULL,  -- e.g. 'social', 'professional', 'travel'
  label TEXT NOT NULL
);

INSERT INTO categories (slug, label) VALUES
  ('social',       'Social Groups'),
  ('professional', 'Professional Networking'),
  ('travel',       'Travel Buddies'),
  ('project',      'Project Collaboration'),
  ('events',       'Event Buddies'),
  ('specialized',  'Specialized Groups');

-- ─── Hives ───────────────────────────────────────────────────
CREATE TABLE hives (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name         TEXT NOT NULL,
  description  TEXT,
  category_id  UUID REFERENCES categories(id),
  creator_id   UUID REFERENCES users(id),
  location     TEXT,
  is_online    BOOLEAN DEFAULT FALSE,
  max_members  INT DEFAULT 10,
  is_open      BOOLEAN DEFAULT TRUE,  -- open = anyone can request to join
  tags         JSONB DEFAULT '[]',
  cover_url    TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Hive Members ────────────────────────────────────────────
CREATE TABLE hive_members (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hive_id    UUID NOT NULL REFERENCES hives(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'member',  -- 'admin' | 'member'
  joined_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (hive_id, user_id)
);

-- ─── Join Requests ───────────────────────────────────────────
CREATE TABLE join_requests (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hive_id     UUID NOT NULL REFERENCES hives(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'approved' | 'rejected'
  message     TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (hive_id, user_id)
);

-- ─── Messages ────────────────────────────────────────────────
CREATE TABLE messages (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hive_id     UUID NOT NULL REFERENCES hives(id) ON DELETE CASCADE,
  sender_id   UUID NOT NULL REFERENCES users(id),
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_messages_hive_id ON messages(hive_id, created_at DESC);

-- ─── Compatibility Scores ────────────────────────────────────
CREATE TABLE compatibility_scores (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  hive_id     UUID NOT NULL REFERENCES hives(id) ON DELETE CASCADE,
  score       NUMERIC(5,2) NOT NULL,  -- 0.00 – 100.00
  -- reasons: JSON array of strings explaining the match
  reasons     JSONB DEFAULT '[]',
  computed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, hive_id)
);

-- ─── Indexes ─────────────────────────────────────────────────
CREATE INDEX idx_profiles_user_id       ON profiles(user_id);
CREATE INDEX idx_hive_members_hive_id   ON hive_members(hive_id);
CREATE INDEX idx_hive_members_user_id   ON hive_members(user_id);
CREATE INDEX idx_join_requests_hive_id  ON join_requests(hive_id);
CREATE INDEX idx_compatibility_user_id  ON compatibility_scores(user_id);
CREATE INDEX idx_compatibility_hive_id  ON compatibility_scores(hive_id);
