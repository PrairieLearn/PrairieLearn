CREATE OR REPLACE FUNCTION
    variants_update_after_grading(
        variant_id bigint
    ) RETURNS void
AS $$
DECLARE
    single_variant boolean;
    assessment_type enum_assessment_type;
BEGIN
    SELECT q.single_variant,          a.type
    INTO     single_variant, assessment_type
    FROM
        variants AS v
        LEFT JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
        LEFT JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
        LEFT JOIN assessments AS a ON (a.id = aq.assessment_id)
    WHERE v.id = variant_id;

    -- If assessment_type = NULL then this is a floating variant for an instructor question.

    IF assessment_type = 'Homework' AND NOT single_variant THEN
        UPDATE variants SET available = true WHERE id = variant_id;
    END IF;
END;
$$ LANGUAGE plpgsql VOLATILE;
