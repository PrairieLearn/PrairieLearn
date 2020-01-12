-- BLOCK select_authz_data
SELECT
    authz_course($authn_user_id, $course_id, $is_administrator) AS permissions_course,
    to_jsonb(c.*) AS course,
    courses_user_can_edit($authn_user_id, $is_administrator) AS courses,
    course_instances_instructor_can_view($authn_user_id, $is_administrator, $req_date, c.id) AS course_instances
FROM
    pl_courses AS c
WHERE
    c.id = $course_id
    AND c.deleted_at IS NULL;
