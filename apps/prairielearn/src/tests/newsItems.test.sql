-- BLOCK insert_notifications
INSERT INTO
  news_item_notifications (user_id, news_item_id)
VALUES
  (1, 1),
  (1, 2);

-- BLOCK select_notification
SELECT
  *
FROM
  news_item_notifications
  JOIN users USING (user_id)
WHERE
  news_item_id = $news_item_id
  AND uid = $uid;
