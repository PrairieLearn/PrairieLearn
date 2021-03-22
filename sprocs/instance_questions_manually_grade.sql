DROP FUNCTION IF EXISTS instance_questions_manually_grade(bigint,double precision,bigint);

CREATE OR REPLACE FUNCTION
    instance_questions_manually_grade (
        instance_question_id bigint,
        manual_grade_score double precision,
        authn_user_id bigint
    ) RETURNS VOID
AS $$
BEGIN

    -- ######################################################################
    -- write/overwrite internal grading logic instance question scoring
    -- NOTE: We bypass:
    --   `instance_questions_calculate_stats.sql` (ie. stats are not produced)
    --   homework or exam grading sub-routines from `instance_questions_grade.sql` (ie. max points logic)

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

    -- TO DO: Integrate with update in grading (points_in_grading) logic once booleans merged and logic clarified
    -- UPDATE instance_questions AS iq
    -- SET
    --     status = 'grading',
    --     points_in_grading = new_values.points,
    --     score_perc_in_grading = new_values.score_perc,
    --     modified_at = now()
    -- WHERE
    --     iq.id = instance_question_id

END;
$$ LANGUAGE plpgsql VOLATILE;
