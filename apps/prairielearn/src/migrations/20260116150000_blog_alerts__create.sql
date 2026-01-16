-- Create cached_blog_posts table to store RSS feed items
CREATE TABLE IF NOT EXISTS cached_blog_posts (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  link TEXT NOT NULL,
  pub_date TIMESTAMPTZ NOT NULL,
  guid TEXT NOT NULL UNIQUE,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cached_blog_posts_pub_date_idx ON cached_blog_posts (pub_date DESC);

-- Create user_blog_read_timestamps table to track when users dismissed blog alerts
CREATE TABLE IF NOT EXISTS user_blog_read_timestamps (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL UNIQUE REFERENCES users (id) ON UPDATE CASCADE ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
