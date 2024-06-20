CREATE TABLE news_items (
  id bigserial PRIMARY KEY,
  uuid uuid NOT NULL UNIQUE,
  directory text NOT NULL,
  date timestamptz NOT NULL DEFAULT now(),
  title text NOT NULL,
  author text,
  visible_to_students boolean NOT NULL DEFAULT FALSE,
  order_by integer NOT NULL DEFAULT 0
);

CREATE TABLE news_item_notifications (
  id bigserial PRIMARY KEY,
  news_item_id bigint NOT NULL REFERENCES news_items (id) ON DELETE CASCADE ON UPDATE CASCADE,
  user_id bigint NOT NULL REFERENCES users (user_id) ON DELETE CASCADE ON UPDATE CASCADE,
  UNIQUE (user_id, news_item_id)
);
