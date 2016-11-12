-- BLOCK insert_question
INSERT INTO questions
    (qid, directory, type,                      title,  config,         client_files,
    course_id,            grading_method,                      deleted_at,
    topic_id)
(SELECT
    $qid, $qid,     $type::enum_question_type, $title, $config::JSONB, $client_files::TEXT[],
    $course_id::integer, $grading_method::enum_grading_method, NULL::timestamp with time zone,
    COALESCE((SELECT id FROM topics WHERE name = $topic AND course_id = $course_id), NULL)
)
ON CONFLICT (qid, course_id) DO UPDATE
SET
    directory = EXCLUDED.directory,
    type = EXCLUDED.type,
    title = EXCLUDED.title,
    config = EXCLUDED.config,
    client_files = EXCLUDED.client_files,
    grading_method = EXCLUDED.grading_method,
    topic_id = EXCLUDED.topic_id,
    deleted_at = EXCLUDED.deleted_at
RETURNING id;

-- BLOCK soft_delete_unused_questions
UPDATE questions AS q
SET deleted_at = CURRENT_TIMESTAMP
WHERE
    q.course_id = $course_id
    AND q.deleted_at IS NULL
    AND q.id NOT IN (SELECT unnest($keep_question_ids::integer[]));

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
