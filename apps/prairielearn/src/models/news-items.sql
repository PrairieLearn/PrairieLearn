-- BLOCK select_unread_news_items_for_user
SELECT
  ni.*
FROM
  news_items AS ni
  LEFT JOIN news_item_read_states AS nirs ON nirs.user_id = $user_id
WHERE
  ni.pub_date > COALESCE(nirs.last_read_at, '-infinity'::timestamptz)
  AND ni.hidden_at IS NULL
ORDER BY
  ni.pub_date DESC
LIMIT
  $limit;

-- BLOCK upsert_news_item_read_state
INSERT INTO
  news_item_read_states (user_id, last_read_at)
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
