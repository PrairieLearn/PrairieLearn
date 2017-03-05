CREATE OR REPLACE FUNCTION
    instance_questions_points(
        IN instance_question_id bigint,
        IN correct boolean,
        OUT open BOOLEAN,
        OUT status enum_instance_question_status,
        OUT points DOUBLE PRECISION,
        OUT score_perc DOUBLE PRECISION,
        OUT current_value DOUBLE PRECISION,
        OUT max_points DOUBLE PRECISION
    ) AS $$
DECLARE
    type enum_assessment_type;
BEGIN
    SELECT
        a.type
    INTO
        type
    FROM
        instance_questions AS iq
        JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
        JOIN assessments AS a ON (a.id = ai.assessment_id)
    WHERE
        iq.id = instance_question_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No instance_question found with id: %', instance_question_id;
    END IF;

    CASE type
        WHEN 'Exam' THEN
            SELECT * INTO open, status, points, score_perc, current_value, max_points
            FROM instance_questions_points_exam(instance_question_id, correct);
        WHEN 'Homework' THEN
            SELECT * INTO open, status, points, score_perc, current_value, max_points
            FROM instance_questions_points_homework(instance_question_id, correct);
        ELSE
            RAISE EXCEPTION 'Unknown assessment type: %', type;
    END CASE;
END;
$$ LANGUAGE plpgsql STABLE;
