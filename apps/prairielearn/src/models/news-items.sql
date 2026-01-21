-- BLOCK select_unread_news_items_for_user
SELECT
  cni.*
FROM
  cached_news_items AS cni
  LEFT JOIN user_news_read_timestamps AS unrt ON unrt.user_id = $user_id
WHERE
  cni.pub_date > COALESCE(unrt.last_read_at, '-infinity'::timestamptz)
ORDER BY
  cni.pub_date DESC
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

-- BLOCK upsert_cached_news_item
INSERT INTO
  cached_news_items (title, link, pub_date, guid)
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
