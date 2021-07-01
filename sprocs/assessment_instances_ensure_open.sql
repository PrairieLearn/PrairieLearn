CREATE FUNCTION
    assessment_instances_ensure_open (
        assessment_instance_id bigint
    ) RETURNS void
AS $$
DECLARE
    current_open boolean;
BEGIN
    SELECT open
    INTO current_open
    FROM assessment_instances
    WHERE id = assessment_instance_id;

    IF NOT FOUND THEN RAISE EXCEPTION 'no such assessment_instance_id: %', assessment_instance_id; END IF;

    IF NOT current_open THEN RAISE EXCEPTION 'assessment instance is not open: %', assessment_instance_id; END IF;
END;
$$ LANGUAGE plpgsql VOLATILE;
