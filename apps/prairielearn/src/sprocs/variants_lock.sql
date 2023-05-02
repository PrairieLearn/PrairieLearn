CREATE FUNCTION
    variants_lock (
        variant_id bigint
    ) RETURNS void
AS $$
DECLARE
    assessment_instance_id bigint;
BEGIN
    SELECT ai.id INTO assessment_instance_id
    FROM
        variants AS v
        LEFT JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
        LEFT JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
    WHERE v.id = variant_id;

    IF NOT FOUND THEN RAISE EXCEPTION 'no such variant_id: %', variant_id; END IF;

    IF assessment_instance_id IS NOT NULL THEN
        -- lock the assessment_instance
        PERFORM ai.id
        FROM assessment_instances AS ai
        WHERE ai.id = assessment_instance_id
        FOR NO KEY UPDATE OF ai;
    ELSE
        -- lock the variant
        PERFORM v.id
        FROM variants AS v
        WHERE v.id = variant_id
        FOR NO KEY UPDATE OF v;
    END IF;
END;
$$ LANGUAGE plpgsql VOLATILE;
