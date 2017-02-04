CREATE OR REPLACE FUNCTION
    assessment_instances_select_label(
        IN assessment_instance_id bigint,
        OUT label text,
        OUT user_uid text
    )
AS $$
BEGIN
    SELECT
        assessment_instance_label(ai, a, aset),
        u.uid
    INTO
        label,
        user_uid
    FROM
        assessment_instances AS ai
        JOIN assessments AS a ON (a.id = ai.assessment_id)
        JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
        JOIN users AS u USING (user_id);
END;
$$ LANGUAGE plpgsql VOLATILE;
