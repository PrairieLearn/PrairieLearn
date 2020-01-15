-- BLOCK select_news_items
SELECT
    ann.*,
    format_date_only_no_tz(ann.date, coalesce(ci.display_timezone, c.display_timezone)) AS formatted_date,
    (an.id IS NOT NULL) AS unread
FROM
    news_items AS ann
    LEFT JOIN news_item_notifications AS an ON (an.news_item_id = ann.id AND an.user_id = $user_id)
    LEFT JOIN course_instances AS ci ON (ci.id = $course_instance_id)
    LEFT JOIN pl_courses AS c ON (c.id = $course_id)
WHERE
    ann.visible_to_students
    OR an.user_id IS NOT NULL
    OR users_is_course_staff($user_id)
ORDER BY
    ann.date DESC, ann.order_by DESC, ann.id DESC;
