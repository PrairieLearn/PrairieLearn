-- Retrieves the last variant for an instance question and last submission for the variant.

CREATE FUNCTION
    instance_question_select_manual_grading_objects(
        IN iq_id bigint,
        OUT question jsonb,
        OUT variant jsonb,
        OUT submission jsonb,
        OUT max_points bigint
    )
AS $$
BEGIN

    SELECT to_jsonb(q.*), to_jsonb(v.*), to_jsonb(s.*), aq.max_points
    INTO question, variant, submission, max_points
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
