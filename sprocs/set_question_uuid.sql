CREATE OR REPLACE FUNCTION set_question_uuid(
        course_id INTEGER,
        qid TEXT,
        uuid UUID
    ) RETURNS VOID
AS $$
BEGIN
    UPDATE questions AS q
    SET
        uuid = set_question_uuid.uuid
    WHERE
        q.qid = set_question_uuid.qid
        AND q.course_id = set_question_uuid.course_id
        AND q.uuid IS NULL;

    -- IF NOT FOUND THEN
    --     RAISE EXCEPTION 'QID not found: %', set_question_uuid.qid;
    -- END IF;
END
$$ LANGUAGE plpgsql;
