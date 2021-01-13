-- BLOCK instance_question_select_last_variant_with_submission
DROP FUNCTION IF EXISTS variants_select_question_and_last_submission(integer);
DROP FUNCTION IF EXISTS variants_select_question_and_last_submission(bigint);

CREATE OR REPLACE FUNCTION
    variants_select_question_and_last_submission(
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

    SELECT to_jsonb(s.*)
    INTO submission
    FROM
        submissions AS s
    WHERE s.variant_id = variants_select_submission_for_grading.variant_id
    ORDER BY s.date DESC, s.id DESC
    LIMIT 1;

    -- SELECT
    --     v.*,   q.*
    -- INTO
    --     variant,    question
    -- FROM
    --     variants AS v
    --     JOIN submissions AS s ON (s.variant_id = v.id)
    --     JOIN instance_questions AS iq ON (v.instance_question_id = iq.id)
    --     JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
    --     JOIN questions AS q ON (aq.question_id = q.id)
    -- WHERE iq.id = 1;

END;
$$ LANGUAGE plpgsql VOLATILE;
