CREATE FUNCTION
    instance_questions_points(
        IN instance_question_id bigint,
        IN submission_score DOUBLE PRECISION,
        OUT open BOOLEAN,
        OUT status enum_instance_question_status,
        OUT auto_points DOUBLE PRECISION,
        OUT points DOUBLE PRECISION,
        OUT score_perc DOUBLE PRECISION,
        OUT highest_submission_score DOUBLE PRECISION,
        OUT current_value DOUBLE PRECISION,
        OUT points_list DOUBLE PRECISION[],
        OUT variants_points_list DOUBLE PRECISION[],
        OUT max_auto_points DOUBLE PRECISION,
        OUT max_points DOUBLE PRECISION
    ) AS $$
DECLARE
    type enum_assessment_type;
    manual_points double precision;
BEGIN
    SELECT
        a.type, COALESCE(iq.manual_points, 0), aq.max_points
    INTO
        type, manual_points, max_points
    FROM
        instance_questions AS iq
        JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
        JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
        JOIN assessments AS a ON (a.id = ai.assessment_id)
    WHERE
        iq.id = instance_question_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No instance_question found with id: %', instance_question_id;
    END IF;

    CASE type
        WHEN 'Exam' THEN
            SELECT * INTO open, status, auto_points, highest_submission_score,
                current_value, points_list, variants_points_list, max_auto_points
            FROM instance_questions_points_exam(instance_question_id, submission_score);
        WHEN 'Homework' THEN
            SELECT * INTO open, status, auto_points, highest_submission_score,
                current_value, points_list, variants_points_list, max_auto_points
            FROM instance_questions_points_homework(instance_question_id, submission_score);
        ELSE
            RAISE EXCEPTION 'Unknown assessment type: %', type;
    END CASE;

    points := auto_points + manual_points;
    score_perc := points / (CASE WHEN max_points = 0 THEN 1 ELSE max_points END) * 100;
END;
$$ LANGUAGE plpgsql STABLE;
