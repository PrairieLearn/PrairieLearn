DROP FUNCTION IF EXISTS zones_points(BIGINT);

CREATE OR REPLACE FUNCTION
    zones_points(
        assessment_instance_id BIGINT
    ) RETURNS TABLE (
        zid BIGINT,
        points DOUBLE PRECISION,
        qids BIGINT[]
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
        WITH all_questions AS (
            SELECT
                iq.id AS qid,
                z.id AS zid,
                iq.points,
                row_number() OVER (PARTITION BY z.id ORDER BY iq.points DESC) AS points_rank,
                z.number_grade,
                z.max_points
            FROM
                instance_questions AS iq
                JOIN assessment_questions as aq ON (aq.id = iq.assessment_question_id)
                JOIN alternative_groups AS ag ON (ag.id = aq.alternative_group_id)
                JOIN zones AS z ON (z.id = ag.zone_id)
            WHERE
                -- need zones_points.assessment_instance_id because just
                -- assessment_instance_id would be ambiguous (it has already been
                -- joined as a column to the table from which we are selecting)
                iq.assessment_instance_id = zones_points.assessment_instance_id
                -- drop deleted questions unless assessment type is Exam
                AND ((aq.deleted_at IS NULL) OR (assessment_type = 'Exam'))
        ), graded_questions AS (
            SELECT
                aq.qid,
                aq.zid,
                aq.points,
                aq.max_points
            FROM
                all_questions AS aq
            WHERE
                ((aq.points_rank <= aq.number_grade) OR (aq.number_grade IS NULL))
        )
        SELECT
            gq.zid,
            LEAST(sum(gq.points), gq.max_points) AS points,
            array_agg(gq.qid) AS qids
        FROM
            graded_questions AS gq
        GROUP BY
            gq.zid,
            gq.max_points;
END;
$$ LANGUAGE plpgsql STABLE;
