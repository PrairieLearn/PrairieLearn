CREATE OR REPLACE FUNCTION
    variants_ensure_instance_question(
        IN variant_id bigint,
        IN instance_question_id bigint,
        OUT variant variants
    )
AS $$
BEGIN
    SELECT v.*
    INTO variant
    FROM
        variants AS v
        JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
    WHERE
        v.id = variant_id
        AND iq.id = instance_question_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'variant_id = % does not match instance_question_id = %', variant_id, instance_question_id;
    END IF;
END;
$$ LANGUAGE plpgsql VOLATILE;
