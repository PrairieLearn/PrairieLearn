-- BLOCK select_user
SELECT
    to_jsonb(u.*) AS user,
    to_jsonb(i.*) AS institution,
    (adm.id IS NOT NULL) AS is_administrator,
    users_is_instructor_in_any_course(u.user_id) AS is_instructor,
    (SELECT count(*) FROM news_item_notifications WHERE user_id = $user_id) AS news_item_notification_count
FROM
    users AS u
    LEFT JOIN administrators AS adm ON (adm.user_id = u.user_id)
    JOIN institutions AS i ON (i.id = u.institution_id)
WHERE
    u.user_id = $user_id;

-- BLOCK enroll_user
INSERT INTO enrollments
    (user_id, course_instance_id)
(
    SELECT
        u.user_id, ci.id
    FROM
        users AS u,
        course_instances AS ci
        JOIN pl_courses AS c ON (c.id = ci.course_id)
    WHERE
        u.uid = $uid
        AND c.short_name = $course_short_name
)
ON CONFLICT DO NOTHING;

-- BLOCK insert_course_permissions_for_user
INSERT INTO course_permissions
    (user_id, course_id, course_role)
(
    SELECT
        u.user_id, c.id, 'Previewer'::enum_course_role
    FROM
        users AS u,
        pl_courses AS c
    WHERE
        u.uid = $uid
        AND c.short_name = $course_short_name
)
ON CONFLICT DO UPDATE SET course_role = 'Previewer'::enum_course_role;
