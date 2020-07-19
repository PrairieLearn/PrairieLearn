-- BLOCK insert_xc101_viewer
WITH example_course AS (
    SELECT * FROM pl_courses WHERE is_example_course IS true LIMIT 1
)
INSERT INTO course_permissions (user_id, course_id, course_role)
    SELECT
        $user_id, xc.id, 'Viewer'
    FROM
        example_course AS xc
    WHERE
        xc.id = $course_id
ON CONFLICT DO NOTHING

-- BLOCK select_authz_data
SELECT
    authz_course($authn_user_id, $course_id, $is_administrator) AS permissions_course,
    to_jsonb(c.*) AS course,
    courses_user_can_edit($authn_user_id, $is_administrator) AS editable_courses,
    courses_user_can_view($authn_user_id, $is_administrator) AS viewable_courses,
    course_instances_instructor_can_view($authn_user_id, $is_administrator, $req_date, c.id) AS course_instances
FROM
    pl_courses AS c
WHERE
    c.id = $course_id
    AND c.deleted_at IS NULL;
