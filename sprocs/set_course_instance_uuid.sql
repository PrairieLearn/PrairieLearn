CREATE OR REPLACE FUNCTION
    set_course_instance_uuid(
        course_id bigint,
        short_name TEXT,
        uuid UUID
    ) RETURNS VOID
AS $$
BEGIN
    UPDATE course_instances AS ci
    SET
        uuid = set_course_instance_uuid.uuid
    WHERE
        ci.short_name = set_course_instance_uuid.short_name
        AND ci.course_id = set_course_instance_uuid.course_id
        AND ci.uuid IS NULL;

    -- IF NOT FOUND THEN
    --     RAISE EXCEPTION 'SHORT_NAME not found: %', set_course_instance_uuid.short_name;
    -- END IF;
END
$$ LANGUAGE plpgsql VOLATILE;
