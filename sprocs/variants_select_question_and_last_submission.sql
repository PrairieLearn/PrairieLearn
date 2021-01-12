-- BLOCK instance_question_select_last_variant_with_submission

DROP FUNCTION IF EXISTS variants_select_question_and_last_submission(integer);

CREATE OR REPLACE FUNCTION
    variants_select_question_and_last_submission(
        IN iq_id integer,
        OUT question questions,
        OUT variant variants
    )
AS $$
<<main>>
DECLARE 
    variant variants;
    question questions;
BEGIN
    SELECT q.*
    INTO question
    FROM
        questions as q
        JOIN assessment_questions AS aq ON (q.id = aq.question_id)
        JOIN instance_questions AS iq ON (aq.id = iq.assessment_question_id)
    WHERE iq.id = iq_id;

    SELECT v.*
    INTO variant
    FROM
        variants as v
        JOIN submissions as s ON (s.variant_id = v.id)
        JOIN instance_questions as iq ON (v.instance_question_id = iq.id)
    WHERE iq.id = iq_id
    ORDER BY v.id DESC
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
