-- BLOCK questions
WITH issue_count AS (
    SELECT
        i.question_id,
        count(*) AS open_issue_count
    FROM issues AS i
    WHERE
        i.course_id = $course_id
        AND i.course_caused
        AND i.open
    GROUP BY i.question_id
)
SELECT
    q.id,
    q.qid,
    q.title,
    q.sync_errors,
    q.sync_warnings,
    q.grading_method,
    q.external_grading_image,
    case when q.type = 'Freeform' then 'v3' else 'v2 (' || q.type || ')' end AS display_type,
    coalesce(issue_count.open_issue_count, 0) AS open_issue_count,
    row_to_json(top) AS topic,
    tags_for_question(q.id) AS tags,
    assessments_format_for_question(q.id, NULL) AS assessments
FROM
    questions AS q
    JOIN topics AS top ON (top.id = q.topic_id)
    LEFT JOIN issue_count ON (issue_count.question_id = q.id)
WHERE
    q.course_id = $course_id
    AND q.deleted_at IS NULL
GROUP BY q.id, top.id, issue_count.open_issue_count
ORDER BY q.qid;

-- BLOCK select_question_id_from_uuid
SELECT
    q.id AS question_id
FROM
    questions AS q
WHERE
    q.uuid = $uuid
    AND q.course_id = $course_id
    AND q.deleted_at IS NULL;
