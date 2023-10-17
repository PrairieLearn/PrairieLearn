CREATE FUNCTION
    variants_update_after_grading(
        variant_id bigint,
        correct boolean
    ) RETURNS void
AS $$
DECLARE
    single_variant boolean;
    assessment_type enum_assessment_type;
    used_all_tries boolean;
BEGIN
    PERFORM variants_lock(variant_id);

    -- Increment num_tries
    UPDATE variants AS v SET num_tries = v.num_tries + 1 WHERE v.id = variant_id;

    -- Get (1) flag that says whether or not the question has only a single variant,
    --     (2) type of assessment
    --     (3) flag that says whether or not max num tries has been reached
    SELECT q.single_variant,                      a.type,
           (v.num_tries >= aq.tries_per_variant)
    INTO   single_variant,                        assessment_type,
           used_all_tries
    FROM
        variants AS v
        JOIN questions AS q ON (q.id = v.question_id)
        LEFT JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
        LEFT JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
        LEFT JOIN assessments AS a ON (a.id = aq.assessment_id)
    WHERE v.id = variant_id;

    -- Close the variant if it's on a homework assessment, if it's not of a
    -- question with only one variant, and if the max num tries has been reached
    IF assessment_type = 'Homework' AND NOT single_variant AND (used_all_tries OR correct) THEN
        UPDATE variants SET open = false WHERE id = variant_id;
    END IF;
END;
$$ LANGUAGE plpgsql VOLATILE;
