CREATE FUNCTION
    chunks_delete(
        IN in_course_id bigint,
        IN deleted_chunks json[]
    ) RETURNS void
AS $$
BEGIN
    WITH chunks_metadata AS (
        SELECT
            (chunk->>'type')::enum_chunk_type AS type,
            q.id AS question_id,
            ci.id AS course_instance_id,
            a.id AS assessment_id,
            (chunk->>'uuid')::uuid AS uuid
        FROM unnest(deleted_chunks) AS chunk(json)
        LEFT JOIN questions AS q ON (q.qid = (chunk->>'questionName') AND q.deleted_at IS NULL AND q.course_id = in_course_id)
        LEFT JOIN course_instances AS ci ON (ci.short_name = (chunk->>'courseInstanceName') AND ci.deleted_at IS NULL AND ci.course_id = in_course_id)
        LEFT JOIN assessments AS a ON (a.tid = (chunk->>'assessmentName') AND a.deleted_at IS NULL AND a.course_instance_id = ci.id)
    ),
    chunks_to_delete AS (
        SELECT id FROM chunks
        INNER JOIN chunks_metadata AS cm ON (
            chunks.course_id = in_course_id
            AND chunks.type = cm.type
            AND CASE
                WHEN (cm.type = 'elements' OR cm.type = 'elementExtensions' OR cm.type = 'clientFilesCourse' OR cm.type = 'serverFilesCourse') THEN TRUE
                WHEN (cm.type = 'clientFilesCourseInstance') THEN cm.course_instance_id = cm.course_instance_id
                WHEN (cm.type = 'clientFilesAssessment') THEN cm.assessment_id = cm.assessment_id
                WHEN (cm.type = 'question') THEN cm.question_id = cm.question_id
                ELSE FALSE
            END
        )
    )
    DELETE FROM chunks
    WHERE id IN (SELECT id FROM chunks_to_delete);
END;
$$ LANGUAGE plpgsql VOLATILE;
