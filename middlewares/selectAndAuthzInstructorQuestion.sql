-- BLOCK select_and_auth
WITH error_count AS (
    SELECT count(*) AS open_error_count
    FROM errors AS e
    WHERE
        e.question_id = $question_id
        AND e.course_caused
        AND e.open
)
SELECT
    to_json(q) AS question,
    to_json(top) AS topic,
    tags_for_question(q.id) AS tags,
    assessments_format_for_question(q.id, ci.id) AS assessments,
    error_count.open_error_count
FROM
    questions as q
    JOIN topics as top ON (top.id = q.topic_id),
    course_instances AS ci,
    error_count
WHERE
    q.id = $question_id
    AND ci.id = $course_instance_id
    AND q.course_id = ci.course_id
    AND q.deleted_at IS NULL;
