-- BLOCK instance_question_select_last_variant_with_submission
DROP FUNCTION IF EXISTS instance_question_select_manual_grading_objects(bigint);

-- Retrieves the last variant for an instance question and last submission for the variant.
-- TODO: Move this query to grab the most recent manual grading job for a given submission?
--       Should we add the variant_id onto the grading_jobs table, and then query the variant ID
--          off of that?   
CREATE OR REPLACE FUNCTION
    instance_question_select_manual_grading_objects(
        IN iq_id bigint,
        OUT question jsonb,
        OUT variant jsonb,
        OUT submission jsonb
    )
AS $$
BEGIN

    SELECT to_jsonb(q.*), to_jsonb(v.*), to_jsonb(s.*)
    INTO question, variant, submission
    FROM
        instance_questions AS iq
        JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
        JOIN questions AS q ON (q.id = aq.question_id)
        LEFT JOIN variants AS v ON (v.instance_question_id = iq.id)
        LEFT JOIN submissions AS s ON (s.variant_id = v.id)
    WHERE iq.id = iq_id
    ORDER BY s.date DESC, s.id DESC
    LIMIT 1;

END;
$$ LANGUAGE plpgsql VOLATILE;
