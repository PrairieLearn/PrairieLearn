CREATE FUNCTION
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
    LEFT JOIN questions AS q ON (q.qid = (chunk->>'questionName') AND q.deleted_at IS NULL AND q.course_id = in_course_id)
    LEFT JOIN course_instances AS ci ON (ci.short_name = (chunk->>'courseInstanceName') AND ci.deleted_at IS NULL AND ci.course_id = in_course_id)
    LEFT JOIN assessments AS a ON (a.tid = (chunk->>'assessmentName') AND a.deleted_at IS NULL AND a.course_instance_id = ci.id)
    ON CONFLICT (type, course_id, coalesce(question_id, -1), coalesce(course_instance_id, -1), coalesce(assessment_id, -1)) DO UPDATE
    SET
        type = EXCLUDED.type,
        question_id = EXCLUDED.question_id,
        course_instance_id = EXCLUDED.course_instance_id,
        assessment_id = EXCLUDED.assessment_id,
        uuid = EXCLUDED.uuid;
END;
$$ LANGUAGE plpgsql VOLATILE;
