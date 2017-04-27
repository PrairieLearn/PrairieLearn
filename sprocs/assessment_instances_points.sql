DROP FUNCTION IF EXISTS assessment_points(bigint,integer);

CREATE OR REPLACE FUNCTION
    assessment_instances_points(
        IN assessment_instance_id bigint,
        IN credit INTEGER,
        OUT points DOUBLE PRECISION,
        OUT points_in_grading DOUBLE PRECISION,
        OUT score_perc DOUBLE PRECISION,
        OUT score_perc_in_grading DOUBLE PRECISION
    ) AS $$
DECLARE
    type enum_assessment_type;
BEGIN
    SELECT
        a.type
    INTO
        type
    FROM
        assessment_instances AS ai
        JOIN assessments AS a ON (a.id = ai.assessment_id)
    WHERE
        ai.id = assessment_instance_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No assessment_instance found with id: %', assessment_instance_id;
    END IF;

    CASE type
        WHEN 'Exam' THEN
            SELECT * INTO points, points_in_grading, score_perc, score_perc_in_grading
            FROM assessment_instances_points_exam(assessment_instance_id, credit);
        WHEN 'Homework' THEN
            SELECT * INTO points, points_in_grading, score_perc, score_perc_in_grading
            FROM assessment_instances_points_homework(assessment_instance_id, credit);
        ELSE
            RAISE EXCEPTION 'Unknown assessment type: %', type;
    END CASE;
END;
$$ LANGUAGE plpgsql STABLE;
