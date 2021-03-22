DROP FUNCTION IF EXISTS instance_questions_manually_grade(bigint,double precision,bigint);

CREATE OR REPLACE FUNCTION
    instance_questions_manually_grade (
        instance_question_id bigint,
        manual_grade_score double precision,
        authn_user_id bigint
    ) RETURNS VOID
AS $$
BEGIN

    -- Manual Grading
    -- ######################################################################
    -- Write/overwrite internal grading logic instance question scoring
    --
    -- NOTE: Unlike internal/external grading, we bypass:
    --   `instance_questions_calculate_stats.sql` (ie. stats are not produced)
    --   homework or exam grading sub-routines from `instance_questions_grade.sql` (ie. max points, highest grade logic)
    -- If external/internal produced prior grading stats data, we honor and do not modify the stats
    --
    -- TO DO: Consider modifying the stats for a special final manual grade operation
    --   NOTE: Spin-lock double grading job submission would skew stats. Logic may be incompatible unless "in grading" mode implemented.

    UPDATE instance_questions
    SET
        points = manual_grade_score * aq.max_points,
        score_perc = manual_grade_score * 100
        -- TO DO: Integrate with update in grading (points_in_grading) logic once booleans merged and logic clarified
        -- status = 'grading',
        -- points_in_grading = manual_grade_score * aq.max_points,
        -- score_perc_in_grading = manual_grade_score * 100
    FROM
        instance_questions AS iq
        JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
    WHERE
        instance_questions.id = iq.id
        AND iq.id = instance_question_id;

END;
$$ LANGUAGE plpgsql VOLATILE;
