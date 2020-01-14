-- BLOCK select_user
WITH notification_counts AS (
    SELECT
        count(*) FILTER (WHERE ann.for_students) AS notification_count_for_student,
        count(*) AS notification_count_for_instructor
    FROM
        announcement_notifications AS an
        JOIN announcements AS ann ON (ann.id = an.announcement_id)
    WHERE
        an.user_id = $user_id
)
SELECT
    to_jsonb(u.*) AS user,
    to_jsonb(i.*) AS institution,
    (adm.id IS NOT NULL) AS is_administrator,
    notification_counts.*
FROM
    users AS u
    LEFT JOIN administrators AS adm ON (adm.user_id = u.user_id)
    JOIN institutions AS i ON (i.id = u.institution_id),
    notification_counts
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
