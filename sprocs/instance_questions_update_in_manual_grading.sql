DROP FUNCTION IF EXISTS instance_questions_update_in_manual_grading(bigint,double precision,bigint);

CREATE OR REPLACE FUNCTION
    instance_questions_update_in_manual_grading (
        instance_question_id bigint,
        manual_grade_score double precision,
        authn_user_id bigint
    ) RETURNS VOID
AS $$
BEGIN

    -- Do we need to implement max points logic for manual grading jobs? Does it make sense?

    -- ######################################################################
    -- overwrite internal grading logic instance question scoring
    -- as we only calc perc on current score out of max assessment instance score, all other
    -- grading machinery data is moot. It should be cleaned out OR re-integrated on manual grading.
    -- grading stat data can be disabled if `instance_questions_calculate_stats(instance_question_id)` does not run
    --

    UPDATE instance_questions
    SET
        points = manual_grade_score * aq.max_points,
        score_perc = manual_grade_score * 100
    FROM
        instance_questions AS iq
        JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
    WHERE
        instance_questions.id = iq.id
        AND iq.id = instance_question_id;

    -- Start to use `points_in_grading` fields when final grade is pending for all grading to be completed
    -- UPDATE instance_questions AS iq
    -- SET
    --     status = 'grading',
    --     points_in_grading = new_values.points,
    --     score_perc_in_grading = new_values.score_perc,
    --     modified_at = now()
    -- WHERE
    --     iq.id = instance_question_id;
END;
$$ LANGUAGE plpgsql VOLATILE;
