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
  fetched_at = now(),
  hidden_at = CASE
    WHEN news_items.managed_by = 'admin' THEN news_items.hidden_at
    ELSE NULL
  END,
  managed_by = CASE
    WHEN news_items.managed_by = 'admin' THEN 'admin'::enum_news_item_managed_by
    ELSE NULL
  END
RETURNING
  *;

-- BLOCK select_all_news_items
SELECT
  ni.*
FROM
  news_items AS ni
ORDER BY
  ni.pub_date DESC;

-- BLOCK set_news_item_hidden
UPDATE news_items
SET
  hidden_at = CASE
    WHEN $hidden THEN now()
    ELSE NULL
  END,
  managed_by = 'admin'
WHERE
  id = $id
RETURNING
  *;

-- BLOCK hide_news_items_not_in_guids
UPDATE news_items
SET
  hidden_at = now(),
  managed_by = 'sync'
WHERE
  guid != ALL ($guids)
  AND managed_by IS DISTINCT FROM 'admin';
