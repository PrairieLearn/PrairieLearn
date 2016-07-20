WITH
course_instance_tests AS (
    SELECT t.id,t.tid,t.type,t.number,t.title,ts.id AS test_set_id,ts.color,
        ts.abbrev AS test_set_abbrev,ts.number AS test_set_number
    FROM tests AS t
    JOIN test_sets AS ts ON (t.test_set_id = ts.id)
    WHERE t.course_instance_id = $2
    AND t.deleted_at IS NULL
)
SELECT q.*,
    top.id AS topic_id,top.name AS topic_name,top.number AS topic_number,top.color AS topic_color,
    JSONB_AGG(JSONB_BUILD_OBJECT(
            'label',t.test_set_abbrev || t.number,
            'test_id',t.id,
            'color',t.color)
          ORDER BY (t.test_set_number, t.number))
      FILTER (WHERE t.test_set_id IS NOT NULL)
      AS tests
FROM questions as q
JOIN topics as top ON (top.id = q.topic_id)
LEFT JOIN (
    test_questions AS tq
    JOIN course_instance_tests as t ON (t.id = tq.test_id)
) ON (tq.question_id = q.id)
WHERE tq.deleted_at IS NULL
AND q.id = $1
AND q.deleted_at IS NULL
GROUP BY q.id,top.id;
