CREATE TYPE enum_news_item_managed_by AS ENUM('admin', 'sync');

-- Create news_items table to store RSS feed items
CREATE TABLE IF NOT EXISTS news_items (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  link TEXT NOT NULL,
  pub_date TIMESTAMPTZ NOT NULL,
  guid TEXT NOT NULL UNIQUE,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  hidden_at TIMESTAMPTZ,
  managed_by enum_news_item_managed_by,
  categories TEXT[] NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS news_items_pub_date_idx ON news_items (pub_date DESC);

-- Create news_item_dismissals table to track which news items each user has dismissed
CREATE TABLE IF NOT EXISTS news_item_dismissals (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users (id) ON UPDATE CASCADE ON DELETE CASCADE,
  news_item_id BIGINT NOT NULL REFERENCES news_items (id) ON UPDATE CASCADE ON DELETE CASCADE,
  dismissed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, news_item_id)
);
