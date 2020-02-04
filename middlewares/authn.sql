-- BLOCK select_user
SELECT
    to_jsonb(u.*) AS user,
    to_jsonb(i.*) AS institution,
    (adm.id IS NOT NULL) AS is_administrator,
    (SELECT count(*) FROM news_item_notifications WHERE user_id = $user_id) AS news_item_notification_count
FROM
    users AS u
    LEFT JOIN administrators AS adm ON (adm.user_id = u.user_id)
    JOIN institutions AS i ON (i.id = u.institution_id)
WHERE
    u.user_id = $user_id;

-- BLOCK enroll_user_as_instructor
INSERT INTO enrollments
    (user_id, course_instance_id, role)
(
    SELECT
        u.user_id, ci.id, 'Instructor'
    FROM
        users AS u,
        course_instances AS ci
        JOIN pl_courses AS c ON (c.id = ci.course_id)
    WHERE
        u.uid = $uid
        AND c.short_name = $course_short_name
)
ON CONFLICT (user_id, course_instance_id) DO UPDATE
SET
    role = 'Instructor';
