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
    q.qid AS question_name,
    a.tid AS assessment_name,
    ci.short_name AS course_instance_name
FROM
    JSON_ARRAY_ELEMENTS($chunks_arr::json) AS chunks_arr,
    chunks
    LEFT JOIN assessments AS a ON (a.id = chunks.assessment_id)
    LEFT JOIN course_instances AS ci ON (ci.id = chunks.course_instance_id OR ci.id = a.course_instance_id)
    LEFT JOIN questions AS q ON (q.id = chunks.question_id)
WHERE
    chunks.course_id = $course_id
    AND chunks.type = chunks_arr.type
    AND ((chunks_arr->>'course_instance_id' IS NULL) OR (chunks.course_instance_id = chunks_arr->>'course_instance_id'))
    AND ((chunks_arr->>'assessment_id' IS NULL) OR (chunks.assessment_id = chunks_arr->>'assessment_id'))
    AND ((chunks_arr->>'question_id' IS NULL) OR (chunks.question_id = chunks_arr->>'question_id'));
