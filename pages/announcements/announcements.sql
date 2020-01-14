-- BLOCK select_announcements
SELECT
    ann.*,
    format_date_only_no_tz(ann.date, coalesce(ci.display_timezone, c.display_timezone)) AS formatted_date,
    (an.id IS NOT NULL) AS unread
FROM
    announcements AS ann
    LEFT JOIN announcement_notifications AS an ON (an.announcement_id = ann.id AND an.user_id = $user_id)
    LEFT JOIN course_instances AS ci ON (ci.id = $course_instance_id)
    LEFT JOIN pl_courses AS c ON (c.id = $course_id)
WHERE
    ann.for_students
    OR an.user_id IS NOT NULL
    OR users_is_course_staff($user_id)
ORDER BY
    ann.date DESC, ann.order_by DESC, ann.id DESC;
