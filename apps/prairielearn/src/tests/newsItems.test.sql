-- BLOCK select_notification
SELECT
  *
FROM
  news_item_notifications
  JOIN users USING (user_id)
WHERE
  news_item_id = $news_item_id
  AND uid = $uid;
