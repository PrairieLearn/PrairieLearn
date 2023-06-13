-- BLOCK select_user
SELECT
  to_jsonb(u.*) AS user,
  to_jsonb(i.*) AS institution,
  (adm.id IS NOT NULL) AS is_administrator,
  users_is_instructor_in_any_course (u.user_id) AS is_instructor,
  (
    SELECT
      count(*)::integer
    FROM
      news_item_notifications
    WHERE
      user_id = $user_id
  ) AS news_item_notification_count
FROM
  users AS u
  LEFT JOIN administrators AS adm ON (adm.user_id = u.user_id)
  JOIN institutions AS i ON (i.id = u.institution_id)
WHERE
  u.user_id = $user_id;
