-- BLOCK questions
SELECT
    q.*,
    row_to_json(top) AS topic,
    tags_for_question(q.id) AS tags,
    assessments_format_for_question(q.id, $course_instance_id) AS assessments
FROM
    questions AS q
    JOIN topics AS top ON (top.id = q.topic_id)
WHERE
    q.course_id IN (
        SELECT ci.course_id
        FROM course_instances AS ci
        WHERE ci.id = $course_instance_id
    )
    AND q.deleted_at IS NULL
GROUP BY q.id,top.id
ORDER BY top.number,q.title;

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
