-- Additive Home bookmark storage. The structural baseline also defines this table.
CREATE TABLE IF NOT EXISTS saved_home_posts (
 user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
 post_id UUID NOT NULL REFERENCES hive_posts(post_id) ON DELETE CASCADE,
 saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY (user_id, post_id)
);
