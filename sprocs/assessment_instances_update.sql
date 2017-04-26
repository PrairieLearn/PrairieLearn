CREATE OR REPLACE FUNCTION
    assessment_instances_update(
        IN assessment_instance_id bigint,
        IN authn_user_id bigint,
        OUT updated boolean
    )
AS $$
DECLARE
    type enum_assessment_type;
BEGIN
    SELECT a.type
    INTO type
    FROM
        assessment_instances AS ai
        JOIN assessments AS a ON (a.id = ai.assessment_id)
    WHERE
        ai.id = assessment_instance_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No assessment_instance found with id: %', assessment_instance_id;
    END IF;

    CASE type
        WHEN 'Exam' THEN
            updated := FALSE;
        WHEN 'Homework' THEN
            SELECT *
            INTO updated
            FROM assessment_instances_update_homework(assessment_instance_id, authn_user_id);
        ELSE
            RAISE EXCEPTION 'Unknown assessment type: %', type;
    END CASE;

    
END;
$$ LANGUAGE plpgsql VOLATILE;
