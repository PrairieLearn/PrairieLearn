CREATE OR REPLACE FUNCTION set_assessment_uuid(
        course_instance_id INTEGER,
        tid TEXT,
        uuid UUID
    ) RETURNS VOID
AS $$
BEGIN
    UPDATE assessments AS a
    SET
        uuid = set_assessment_uuid.uuid
    WHERE
        a.tid = set_assessment_uuid.tid
        AND a.course_instance_id = set_assessment_uuid.course_instance_id
        AND a.uuid IS NULL;

    -- IF NOT FOUND THEN
    --     RAISE EXCEPTION 'TID not found: %', set_assessment_uuid.tid;
    -- END IF;
END
$$ LANGUAGE plpgsql;
