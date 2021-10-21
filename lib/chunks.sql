-- BLOCK select_course_chunks
SELECT
    chunks.*,
    q.uuid AS question_uuid,
    q.qid AS question_name,
    a.uuid AS assessment_uuid,
    a.tid AS assessment_name,
    ci.uuid AS course_instance_uuid,
    ci.short_name AS course_instance_name
FROM
    chunks
    LEFT JOIN assessments AS a ON (a.id = chunks.assessment_id)
    LEFT JOIN course_instances AS ci ON (ci.id = chunks.course_instance_id OR ci.id = a.course_instance_id)
    LEFT JOIN questions AS q ON (q.id = chunks.question_id)
WHERE
    chunks.course_id = $course_id;

-- BLOCK select_metadata_for_chunks
SELECT
    chunks.*,
    (chunks_arr->>'type')::enum_chunk_type AS type,
    q.qid AS question_name,
    a.tid AS assessment_name,
    ci.short_name AS course_instance_name
FROM
    JSON_ARRAY_ELEMENTS($chunks_arr::json) AS chunks_arr
    -- Note that we specifically use a LEFT JOIN here - this is what allows the
    -- caller to differentiate between a chunk that exists and one that does not.
    -- Chunks that don't exist will have a NULL id, but they'll still contain
    -- other information like the course instnace/assessment/question name so that
    -- we can clean up unused chunks from disk.
    LEFT JOIN chunks ON (
        chunks.course_id = ($course_id)::bigint
        AND chunks.type = (chunks_arr->>'type')::enum_chunk_type
        AND ((chunks_arr->>'courseInstanceId' IS NULL) OR (chunks.course_instance_id = (chunks_arr->>'courseInstanceId')::bigint))
        AND ((chunks_arr->>'assessmentId' IS NULL) OR (chunks.assessment_id = (chunks_arr->>'assessmentId')::bigint))
        AND ((chunks_arr->>'questionId' IS NULL) OR (chunks.question_id = (chunks_arr->>'questionId')::bigint))
    )
    LEFT JOIN assessments AS a ON (a.id = chunks.assessment_id)
    LEFT JOIN course_instances AS ci ON (ci.id = chunks.course_instance_id OR ci.id = a.course_instance_id)
    LEFT JOIN questions AS q ON (q.id = chunks.question_id);

-- BLOCK select_course_dir
SELECT c.path
FROM pl_courses AS c
WHERE c.id = $course_id;

-- BLOCK select_template_question_ids
WITH RECURSIVE template_questions AS (
    -- non-recursive term that finds the ID of the template question (if any) for question_id
    SELECT tq.id, tq.qid, tq.course_id, tq.template_directory
    FROM
        questions AS q
        JOIN questions AS tq ON (tq.qid = q.template_directory AND tq.course_id = q.course_id)
    WHERE q.id = $question_id
    -- required UNION for a recursive WITH statement
    UNION
    -- recursive term that references template_questions again
    SELECT tq.id, tq.qid, tq.course_id, tq.template_directory
    FROM
        template_questions AS q
        JOIN questions AS tq ON (tq.qid = q.template_directory AND tq.course_id = q.course_id)
)
SELECT id FROM template_questions LIMIT 100; -- LIMIT prevents infinite recursion on circular templates
