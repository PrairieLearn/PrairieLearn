-- Create news_items table to store RSS feed items
CREATE TABLE IF NOT EXISTS news_items (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  link TEXT NOT NULL,
  pub_date TIMESTAMPTZ NOT NULL,
  guid TEXT NOT NULL UNIQUE,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  hidden_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS news_items_pub_date_idx ON news_items (pub_date DESC);

-- Create user_news_read_timestamps table to track when users dismissed news alerts
CREATE TABLE IF NOT EXISTS user_news_read_timestamps (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL UNIQUE REFERENCES users (id) ON UPDATE CASCADE ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
