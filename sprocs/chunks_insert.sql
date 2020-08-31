CREATE OR REPLACE FUNCTION
    chunks_insert(
        IN course_id bigint,
        IN generated_chunks json[]
    ) RETURNS void
AS $$
DECLARE
    chunk json;
    found_chunk_id bigint;
BEGIN
    FOR chunk IN SELECT * FROM unnest(generated_chunks) LOOP
        found_chunk_id := NULL;

        IF chunk->>'type' = 'question' THEN
            SELECT c.id
            INTO found_chunk_id
            FROM chunks AS c
            JOIN questions AS q ON q.uuid = (chunk->>'questionUuid')::uuid AND
                 q.qid = (chunk->>'questionName')
            WHERE c.question_id = q.id AND
                  c.type = (chunk->>'type')::enum_chunk_type AND
                  q.course_id = chunks_insert.course_id
            LIMIT 1;

            IF found_chunk_id IS NOT NULL THEN
                UPDATE chunks
                SET uuid = (chunk->>'uuid')::uuid
                WHERE id = found_chunk_id;
            ELSE
                INSERT INTO chunks (question_id, uuid, type, course_id)
                     (SELECT
                          q.id,
                          (chunk->>'uuid')::uuid,
                          (chunk->>'type')::enum_chunk_type,
                          q.course_id
                      FROM
                          questions AS q
                      WHERE
                          q.uuid = (chunk->>'questionUuid')::uuid AND
                          q.qid = chunk->>'questionName' AND
                          q.course_id = chunks_insert.course_id);
            END IF;
        ELSIF chunk->>'type' = 'elements' THEN
            RAISE warning '%: %', chunk->>'type', chunk::TEXT;
        ELSIF chunk->>'type' = 'clientFilesCourse' THEN
            RAISE warning '%: %', chunk->>'type', chunk::TEXT;
        ELSIF chunk->>'type' = 'serverFilesCourse' THEN
            RAISE warning '%: %', chunk->>'type', chunk::TEXT;
        ELSIF chunk->>'type' = 'clientFilesCourseInstance' THEN
            RAISE warning '%: %', chunk->>'type', chunk::TEXT;
        ELSIF chunk->>'type' = 'clientFilesAssessment' THEN
            RAISE warning '%: %', chunk->>'type', chunk::TEXT;
        ELSE
            RAISE exception 'Unknown chunk type %s', chunk->>type;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql VOLATILE;
