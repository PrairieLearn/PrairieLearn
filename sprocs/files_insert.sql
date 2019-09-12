
CREATE OR REPLACE FUNCTION
    files_insert(
        IN display_filename text,
        IN storage_filename text,
        IN type text,
        IN assessment_instance_id bigint,
        IN instance_question_id bigint,
        IN user_id bigint,
        IN authn_user_id bigint,
        OUT file_id bigint
    )
AS $$
DECLARE
    assessment_id bigint;
BEGIN
    -- ######################################################################
    -- get the variant

    SELECT ai.assessment_id
    INTO assessment_id
    FROM assessment_instances AS ai
    WHERE ai.id = assessment_instance_id;

    IF NOT FOUND THEN RAISE EXCEPTION 'invalid assessment_instance_id = %', assessment_instance_id; END IF;
    
    -- ######################################################################
    -- insert the file

    INSERT INTO files
           (display_filename, storage_filename, type, assessment_id, assessment_instance_id, instance_question_id, user_id, created_by)
    VALUES (display_filename, storage_filename, type, assessment_id, assessment_instance_id, instance_question_id, user_id, authn_user_id)
    RETURNING id
    INTO file_id;

END;
$$ LANGUAGE plpgsql VOLATILE;
