CREATE FUNCTION
    instance_questions_manually_grade (
        arg_instance_question_id bigint,
        arg_manual_grade_score double precision
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
    UPDATE instance_questions
    SET
        points = ROUND(CAST(FLOAT8 (arg_manual_grade_score * aq.max_points) AS NUMERIC), 2),
        score_perc = FLOOR(arg_manual_grade_score * 100),
        -- TO DO: Integrate with update in grading (points_in_grading) logic once booleans merged and logic clarified
        -- status = 'grading',
        -- points_in_grading = arg_manual_grade_score * aq.max_points,
        -- score_perc_in_grading = arg_manual_grade_score * 100
        modified_at = now()
        -- Note: Other grade updates may not be updating modified_at, which may become problematic
        -- when other processes are grading simataneously and manual grading is taking place.
    FROM
        instance_questions AS iq
        JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
    WHERE
        instance_questions.id = iq.id
        AND iq.id = arg_instance_question_id;

END;
$$ LANGUAGE plpgsql VOLATILE;
