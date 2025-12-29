-- BLOCK select_notification
SELECT
  *
FROM
  news_item_notifications AS nin
  JOIN users AS u ON (u.id = nin.user_id)
WHERE
  nin.news_item_id = $news_item_id
  AND u.uid = $uid;
