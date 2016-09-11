-- BLOCK insert
INSERT INTO questions
    (qid, directory, type, title, config, course_id, deleted_at, topic_id)
(SELECT * FROM
    (VALUES ($qid, $qid, $type::enum_question_type, $title, $config::JSONB, $course_id::integer, NULL::timestamp with time zone)) AS vals,
    (SELECT COALESCE((SELECT id FROM topics WHERE name = $topic AND course_id = $course_id), NULL)) AS topics
)
ON CONFLICT (qid, course_id) DO UPDATE
SET
    directory = EXCLUDED.directory,
    type = EXCLUDED.type,
    title = EXCLUDED.title,
    config = EXCLUDED.config,
    topic_id = EXCLUDED.topic_id,
    deleted_at = EXCLUDED.deleted_at
RETURNING id;

-- BLOCK ensure_numbers
WITH
questions_needing_numbers AS (
    SELECT
        id, row_number() OVER () AS index
    FROM
        questions
    WHERE
        number IS NULL
        AND course_id = $course_id
    ORDER BY id
),
new_numbers AS (
    SELECT *
    FROM random_unique(100, 1000, (SELECT array_agg(number) FROM questions WHERE course_id = $course_id))
),
questions_with_new_numbers AS (
    -- use row_number() as the matching key for the join
    SELECT qnn.id, nn.number
    FROM questions_needing_numbers AS qnn
    JOIN new_numbers AS nn ON (qnn.index = nn.index)
)
UPDATE
    questions AS q
SET
    number = qwnn.number
FROM
    questions_with_new_numbers AS qwnn
WHERE q.id = qwnn.id;
