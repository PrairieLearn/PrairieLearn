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
    AND q.deleted_at IS NULL;
