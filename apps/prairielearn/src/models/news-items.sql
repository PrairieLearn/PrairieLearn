-- BLOCK select_unread_news_items_for_user
SELECT
  ni.*
FROM
  news_items AS ni
  LEFT JOIN user_news_read_timestamps AS unrt ON unrt.user_id = $user_id
WHERE
  ni.pub_date > COALESCE(unrt.last_read_at, '-infinity'::timestamptz)
  AND ni.hidden_at IS NULL
ORDER BY
  ni.pub_date DESC
LIMIT
  $limit;

-- BLOCK upsert_user_news_read_timestamp
INSERT INTO
  user_news_read_timestamps (user_id, last_read_at)
VALUES
  ($user_id, now())
ON CONFLICT (user_id) DO UPDATE
SET
  last_read_at = now()
RETURNING
  *;

-- BLOCK upsert_news_item
INSERT INTO
  news_items (title, link, pub_date, guid)
VALUES
  ($title, $link, $pub_date, $guid)
ON CONFLICT (guid) DO UPDATE
SET
  title = EXCLUDED.title,
  link = EXCLUDED.link,
  pub_date = EXCLUDED.pub_date,
  fetched_at = now()
RETURNING
  *;

-- BLOCK select_all_news_items
SELECT
  ni.*
FROM
  news_items AS ni
ORDER BY
  ni.pub_date DESC;

-- BLOCK hide_news_item
UPDATE news_items
SET
  hidden_at = now()
WHERE
  id = $id
RETURNING
  *;
