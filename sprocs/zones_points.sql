CREATE OR REPLACE FUNCTION
    zones_points(
        assessment_instance_id bigint
    ) RETURNS TABLE (
        zone_id bigint,
        points DOUBLE PRECISION
    ) AS $$
DECLARE
    assessment_type enum_assessment_type;
BEGIN
    -- #########################################################################
    -- determine the assessment type

    SELECT a.type
    INTO assessment_type
    FROM
        assessment_instances AS ai
        JOIN assessments AS a ON (a.id = ai.assessment_id)
    WHERE ai.id = assessment_instance_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No assessment_instance found with id: %', assessment_instance_id;
    END IF;

    IF NOT ((assessment_type = 'Exam') OR (assessment_type = 'Homework')) THEN
        RAISE EXCEPTION 'Unknown assessment_type: %', assessment_type;
    END IF;

    -- #########################################################################
    -- compute the points by zone
    RETURN QUERY
        SELECT
            z.id AS zone_id,
            LEAST(sum(iq.points), z.max_points) AS points
        FROM
            instance_questions AS iq
            JOIN assessment_questions as aq ON (aq.id = iq.assessment_question_id)
            JOIN alternative_groups AS ag ON (ag.id = aq.alternative_group_id)
            JOIN zones AS z ON (z.id = ag.zone_id)
        WHERE
            iq.assessment_instance_id = zones_points.assessment_instance_id
            -- drop deleted questions unless assessment type is Exam
            AND ((aq.deleted_at IS NULL) OR (assessment_type = 'Exam'))
        GROUP BY
            z.id;
END;
$$ LANGUAGE plpgsql STABLE;
