CREATE FUNCTION
    assessment_instances_lock (
        assessment_instance_id bigint
    ) RETURNS void
AS $$
BEGIN
    PERFORM ai.id
    FROM assessment_instances AS ai
    WHERE ai.id = assessment_instance_id
    FOR NO KEY UPDATE OF ai;

    IF NOT FOUND THEN RAISE EXCEPTION 'no such assessment_instance_id: %', assessment_instance_id; END IF;
END;
$$ LANGUAGE plpgsql VOLATILE;
