-- BLOCK questions
WITH
course_questions AS (
    SELECT
        q.id,q.qid,q.type,q.title,
        top.id AS topic_id,top.name AS topic_name,top.number AS topic_number,top.color AS topic_color
    FROM questions AS q
    JOIN topics AS top ON (top.id = q.topic_id)
    WHERE q.course_id IN (
        SELECT c.id
        FROM courses AS c
        JOIN course_instances AS ci ON (c.id = ci.course_id)
        WHERE ci.id = $1
    )
    AND q.deleted_at IS NULL
),
course_instance_tests AS (
    SELECT t.id,t.tid,t.type,t.number,t.title,ts.id AS test_set_id,ts.color,
        ts.abbrev AS test_set_abbrev,ts.number AS test_set_number
    FROM tests AS t
    JOIN test_sets AS ts ON (t.test_set_id = ts.id)
    WHERE t.course_instance_id = $1
    AND t.deleted_at IS NULL
)
SELECT q.id,q.qid,q.type,q.title,
    q.topic_id,q.topic_name,q.topic_number,q.topic_color,
    JSONB_AGG(JSONB_BUILD_OBJECT(
            'label',t.test_set_abbrev || t.number,
            'test_id',t.id,
            'color',t.color)
          ORDER BY (t.test_set_number, t.number))
      FILTER (WHERE t.test_set_id IS NOT NULL)
      AS tests
FROM course_questions AS q
LEFT JOIN (
    test_questions AS tq
    JOIN course_instance_tests as t ON (t.id = tq.test_id)
) ON (tq.question_id = q.id)
WHERE tq.deleted_at IS NULL
GROUP BY q.id,q.qid,q.type,q.title,q.topic_id,q.topic_name,q.topic_number,q.topic_color
ORDER BY q.topic_number,q.title;


-- BLOCK tests
SELECT ts.abbrev || t.number AS label
FROM tests AS t
JOIN test_sets AS ts ON (ts.id = t.test_set_id)
WHERE t.course_instance_id = $1
AND t.deleted_at IS NULL
ORDER BY ts.number,t.number;
