-- BLOCK select_news_items
SELECT
  ni.*,
  format_date_only_no_tz (
    ni.date,
    coalesce(ci.display_timezone, c.display_timezone)
  ) AS formatted_date,
  (an.id IS NOT NULL) AS unread,
  (
    users_is_instructor_in_any_course ($user_id)
    AND ni.visible_to_students
  ) AS show_student_badge
FROM
  news_items AS ni
  LEFT JOIN news_item_notifications AS an ON (
    an.news_item_id = ni.id
    AND an.user_id = $user_id
  )
  LEFT JOIN course_instances AS ci ON (ci.id = $course_instance_id)
  LEFT JOIN pl_courses AS c ON (c.id = $course_id)
WHERE
  ni.visible_to_students
  OR an.user_id IS NOT NULL
  OR users_is_instructor_in_any_course ($user_id)
ORDER BY
  ni.date DESC,
  ni.order_by DESC,
  ni.id DESC;
