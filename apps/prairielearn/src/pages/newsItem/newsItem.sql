-- BLOCK select_news_item_for_read
WITH
  mark_news_item_as_read AS (
    DELETE FROM news_item_notifications
    WHERE
      news_item_id = $news_item_id
      AND user_id = $user_id
  )
SELECT
  ni.*
FROM
  news_items AS ni
WHERE
  ni.id = $news_item_id;

-- BLOCK select_news_item
SELECT
  *
FROM
  news_items
WHERE
  id = $news_item_id;
