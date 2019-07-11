-- BLOCK insert_question
INSERT INTO questions
    (uuid,  qid, directory, type,                      title,  options,         client_files,
    partial_credit,   course_id,           grading_method,                       single_variant,
    deleted_at,                      template_directory,
    topic_id,
    external_grading_enabled,
    external_grading_image,
    external_grading_files,
    external_grading_entrypoint,
    external_grading_timeout,
    external_grading_enable_networking)
(SELECT
    $uuid, $qid, $qid,     $type::enum_question_type, $title, $options::JSONB, $client_files::TEXT[],
    $partial_credit, $course_id::integer, $grading_method::enum_grading_method, $single_variant,
    NULL::timestamp with time zone, $template_directory,
    COALESCE((SELECT id FROM topics WHERE name = $topic AND course_id = $course_id), NULL),
    $external_grading_enabled,
    $external_grading_image,
    $external_grading_files,
    $external_grading_entrypoint,
    $external_grading_timeout,
    $external_grading_enable_networking
)
ON CONFLICT (uuid) DO UPDATE
SET
    qid = EXCLUDED.qid,
    directory = EXCLUDED.directory,
    type = EXCLUDED.type,
    title = EXCLUDED.title,
    options = EXCLUDED.options,
    client_files = EXCLUDED.client_files,
    partial_credit = EXCLUDED.partial_credit,
    grading_method = EXCLUDED.grading_method,
    single_variant = EXCLUDED.single_variant,
    template_directory = EXCLUDED.template_directory,
    topic_id = EXCLUDED.topic_id,
    deleted_at = EXCLUDED.deleted_at,
    external_grading_enabled = EXCLUDED.external_grading_enabled,
    external_grading_image = EXCLUDED.external_grading_image,
    external_grading_files = EXCLUDED.external_grading_files,
    external_grading_entrypoint = EXCLUDED.external_grading_entrypoint,
    external_grading_timeout = EXCLUDED.external_grading_timeout,
    external_grading_enable_networking = EXCLUDED.external_grading_enable_networking
WHERE
    questions.course_id = $course_id
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
