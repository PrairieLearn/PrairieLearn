-- BLOCK insert_xc101_viewer
WITH
example_course AS (
    SELECT * FROM pl_courses WHERE (options->'isExampleCourse')::boolean IS TRUE
)
INSERT INTO course_permissions
    (user_id, course_id, course_role)
SELECT
    $user_id, xc.id, 'Viewer'
FROM
    example_course as xc
ON CONFLICT DO NOTHING

-- BLOCK select_and_auth
WITH issue_count AS (
    SELECT count(*) AS open_issue_count
    FROM issues AS i
    WHERE
        i.question_id = $question_id
        AND i.course_caused
        AND i.open
)
SELECT
    to_json(q) AS question,
    to_json(top) AS topic,
    tags_for_question(q.id) AS tags,
    issue_count.open_issue_count
FROM
    questions as q
    JOIN topics as top ON (top.id = q.topic_id),
    issue_count
WHERE
    q.id = $question_id
    AND q.course_id = $course_id
    AND q.deleted_at IS NULL;

-- BLOCK select_and_auth_with_course_instance
WITH issue_count AS (
    SELECT count(*) AS open_issue_count
    FROM issues AS i
    WHERE
        i.question_id = $question_id
        AND i.course_caused
        AND i.open
)
SELECT
    to_json(q) AS question,
    to_json(top) AS topic,
    tags_for_question(q.id) AS tags,
    assessments_format_for_question(q.id, ci.id) AS assessments,
    issue_count.open_issue_count
FROM
    questions as q
    JOIN topics as top ON (top.id = q.topic_id),
    course_instances AS ci,
    issue_count
WHERE
    q.id = $question_id
    AND ci.id = $course_instance_id
    AND q.course_id = ci.course_id
    AND q.deleted_at IS NULL;
