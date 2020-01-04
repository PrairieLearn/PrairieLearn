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
    q.*,
    coalesce(issue_count.open_issue_count, 0) AS open_issue_count,
    row_to_json(top) AS topic,
    tags_for_question(q.id) AS tags,
    assessments_format_for_question(q.id, $course_instance_id) AS assessments
FROM
    questions AS q
    JOIN topics AS top ON (top.id = q.topic_id)
    LEFT JOIN issue_count ON (issue_count.question_id = q.id)
WHERE
    q.course_id = $course_id
    AND q.deleted_at IS NULL
GROUP BY q.id, top.id, issue_count.open_issue_count
ORDER BY top.number, q.title;

-- BLOCK tags
SELECT tag.name AS name
FROM tags AS tag
WHERE tag.course_id = $course_id
ORDER BY tag.number;

-- BLOCK assessments
SELECT aset.abbreviation || a.number AS label
FROM assessments AS a
JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
WHERE a.course_instance_id = $course_instance_id
AND a.deleted_at IS NULL
ORDER BY aset.number,a.number;

-- BLOCK select_question_id_from_uuid
SELECT
    q.id AS question_id
FROM
    questions AS q
WHERE
    q.uuid = $uuid
    AND q.course_id = $course_id
    AND q.deleted_at IS NULL;
