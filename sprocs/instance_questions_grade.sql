CREATE FUNCTION
    instance_questions_grade(
        instance_question_id bigint,
        submission_score DOUBLE PRECISION,
        grading_job_id bigint,
        authn_user_id bigint
    ) RETURNS VOID
AS $$
DECLARE
    instance_question_open boolean;
    manual_points double precision;
    max_points double precision;
    new_score_perc double precision;
    new_values record;
    new_instance_question instance_questions%ROWTYPE;
BEGIN
    SELECT iq.open, COALESCE(iq.manual_points, 0), aq.max_points
    INTO instance_question_open, manual_points, max_points
    FROM
        instance_questions AS iq
        JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
    WHERE iq.id = instance_question_id;

    IF NOT instance_question_open THEN
        -- this shouldn't happen, so log an error
        PERFORM issues_insert_for_variant(
            v.id, 'Submission when instance question is closed', '', false,
            false, jsonb_build_object('grading_job_id', grading_job_id),
            '{}'::jsonb, instance_questions_grade.authn_user_id)
        FROM
            grading_jobs AS gj
            JOIN submissions AS s ON (s.id = gj.submission_id)
            JOIN variants AS v ON (v.id = s.variant_id)
        WHERE
            gj.id = grading_job_id;

        RETURN;
    END IF;

    SELECT *, auto_points + instance_question_manual_points AS points
    INTO new_values
    FROM instance_questions_points(instance_question_id, submission_score);

    new_score_perc := new_values.points / (CASE WHEN max_points = 0 THEN 1 ELSE max_points END) * 100;

    UPDATE instance_questions AS iq
    SET
        open = new_values.open,
        status = new_values.status,
        auto_points = new_values.auto_points,
        points = new_values.points,
        auto_score_perc = new_values.auto_score_perc,
        score_perc = new_score_perc,
        highest_submission_score = new_values.highest_submission_score,
        current_value = new_values.current_value,
        points_list = new_values.points_list,
        variants_points_list = new_values.variants_points_list,
        number_attempts = iq.number_attempts + 1
    WHERE
        iq.id = instance_question_id;

    INSERT INTO question_score_logs
        (instance_question_id, auth_user_id, max_points,
         points, auto_points, score_perc, auto_score_perc,
         grading_job_id)
    VALUES
        (instance_question_id, authn_user_id, max_points, new_values.max_auto_points,
         new_values.points, new_values.auto_points, new_score_perc, new_values.auto_score_perc,
         grading_job_id);

    PERFORM instance_questions_calculate_stats(instance_question_id);
END;
$$ LANGUAGE plpgsql VOLATILE;
