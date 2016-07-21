-- BLOCK questions
SELECT
    q.*,
    row_to_json(top) AS topic,
    tests_for_question(q.id, $1) AS tests
FROM
    questions AS q
    JOIN topics AS top ON (top.id = q.topic_id)
WHERE
    q.course_id IN (
        SELECT ci.course_id
        FROM course_instances AS ci
        WHERE ci.id = $1
    )
    AND q.deleted_at IS NULL
GROUP BY q.id,top.id
ORDER BY top.number,q.title;

-- BLOCK tests
SELECT ts.abbrev || t.number AS label
FROM tests AS t
JOIN test_sets AS ts ON (ts.id = t.test_set_id)
WHERE t.course_instance_id = $1
AND t.deleted_at IS NULL
ORDER BY ts.number,t.number;
