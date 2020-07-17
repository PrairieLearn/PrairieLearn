-- insert_xc101_viewer
WITH
course_permissions_for_user AS (
    SELECT
        *
    FROM
        course_permissions AS cp
    WHERE
        cp.user_id = $user_id
),
example_course AS (
    SELECT * FROM pl_courses WHERE (options->'isExampleCourse')::boolean IS TRUE
)
INSERT INTO course_permissions (user_id, course_id, course_role)
    SELECT
        cp.user_id, xc.id, 'Viewer'
    FROM
        course_permissions_for_user AS cp
        JOIN example_course AS xc ON (xc.id != cp.course_id)
    WHERE
        cp.course_role IN ('Owner', 'Editor')
    LIMIT 1
ON CONFLICT DO NOTHING
