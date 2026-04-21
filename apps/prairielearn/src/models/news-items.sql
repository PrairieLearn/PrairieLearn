-- BLOCK select_unread_news_items_for_user
SELECT
  ni.*
FROM
  news_items AS ni
WHERE
  ni.hidden_at IS NULL
  AND NOT EXISTS (
    SELECT
      1
    FROM
      news_item_dismissals AS nid
    WHERE
      nid.user_id = $user_id
      AND nid.news_item_id = ni.id
  )
ORDER BY
  ni.pub_date DESC
LIMIT
  $limit;

-- BLOCK dismiss_all_news_items_for_user
INSERT INTO
  news_item_dismissals (user_id, news_item_id)
SELECT
  $user_id,
  ni.id
FROM
  news_items AS ni
WHERE
  ni.hidden_at IS NULL
ON CONFLICT (user_id, news_item_id) DO NOTHING;

-- BLOCK upsert_news_items
INSERT INTO
  news_items (title, link, pub_date, guid, categories)
SELECT
  (item ->> 'title')::text,
  (item ->> 'link')::text,
  (item ->> 'pub_date')::timestamptz,
  (item ->> 'guid')::text,
  ARRAY(
    SELECT
      jsonb_array_elements_text(item -> 'categories')
  )::text[]
FROM
  UNNEST($items::jsonb[]) AS item
ON CONFLICT (guid) DO UPDATE
SET
  title = EXCLUDED.title,
  link = EXCLUDED.link,
  pub_date = EXCLUDED.pub_date,
  categories = EXCLUDED.categories,
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
  managed_by = CASE
    WHEN $hidden THEN 'admin'::enum_news_item_managed_by
    ELSE NULL
  END
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
