-- BLOCK instance_question_select_last_variant_with_submission
DROP FUNCTION IF EXISTS instance_question_select_manual_grading_objects(bigint);

-- Retrieves the last variant for an instance question and last submission for the variant.

CREATE OR REPLACE FUNCTION
    instance_question_select_manual_grading_objects(
        IN iq_id bigint,
        OUT question jsonb,
        OUT variant jsonb,
        OUT submission jsonb
    )
AS $$
BEGIN

    SELECT to_jsonb(q.*)
    INTO question
    FROM
        questions as q
        JOIN assessment_questions AS aq ON (q.id = aq.question_id)
        JOIN instance_questions AS iq ON (aq.id = iq.assessment_question_id)
    WHERE iq.id = iq_id;

    SELECT to_jsonb(v.*)
    INTO variant
    FROM
        variants as v
        JOIN submissions as s ON (s.variant_id = v.id)
        JOIN instance_questions as iq ON (v.instance_question_id = iq.id)
    WHERE iq.id = iq_id
    ORDER BY v.date DESC, v.id DESC
    LIMIT 1;

    -- If a variant has not been found, student has not loaded question
    IF variant IS NULL THEN RETURN; END IF;

    -- If student has not loaded question, expect submission to be null
    SELECT to_jsonb(s.*)
    INTO submission
    FROM submissions AS s
    WHERE s.variant_id = (SELECT (variant->'id')::bigint)
    ORDER BY s.date DESC, s.id DESC
    LIMIT 1;

END;
$$ LANGUAGE plpgsql VOLATILE;
