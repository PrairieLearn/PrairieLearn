CREATE OR REPLACE FUNCTION
    chunks_insert(
        IN in_course_id bigint,
        IN generated_chunks json[]
    ) RETURNS void
AS $$
BEGIN
    INSERT INTO chunks (type, course_id, question_id, course_instance_id, assessment_id, uuid)
    SELECT
        (chunk->>'type')::enum_chunk_type,
        in_course_id,
        q.id,
        ci.id,
        a.id,
        (chunk->>'uuid')::uuid
    FROM unnest(generated_chunks) AS chunk(json)
    LEFT JOIN questions AS q ON (q.uuid = (chunk->>'questionUuid')::uuid AND q.qid = (chunk->>'questionName'))
    LEFT JOIN assessments AS a ON (a.uuid = (chunk->>'assessmentUuid')::uuid AND a.tid = (chunk->>'assessmentName'))
    LEFT JOIN course_instances AS ci ON (ci.uuid = (chunk->>'courseInstanceUuid')::uuid AND ci.short_name = (chunk->>'courseInstanceName'))
    ON CONFLICT (type, course_id, question_id, course_instance_id, assessment_id) DO UPDATE
    SET
        type = EXCLUDED.type,
        question_id = EXCLUDED.question_id,
        course_instance_id = EXCLUDED.course_instance_id,
        assessment_id = EXCLUDED.assessment_id,
        uuid = EXCLUDED.uuid;
END;
$$ LANGUAGE plpgsql VOLATILE;
