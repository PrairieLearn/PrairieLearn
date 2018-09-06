DROP FUNCTION IF EXISTS assessment_instances_points(bigint,integer,boolean);
DROP FUNCTION IF EXISTS zones_points(BIGINT);
DROP FUNCTION IF EXISTS zones_max_points(BIGINT);

CREATE OR REPLACE FUNCTION
    assessment_instances_points(
        assessment_instance_id BIGINT
    ) RETURNS TABLE (
        zid BIGINT,
        points DOUBLE PRECISION,
        qids BIGINT[],
        max_points DOUBLE PRECISION,
        max_qids BIGINT[]
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
                aq.max_points,
                row_number() OVER (PARTITION BY z.id ORDER BY aq.max_points DESC) AS max_points_rank,
                z.number_grade,
                z.max_points AS zone_max_points
            FROM
                instance_questions AS iq
                JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
                JOIN alternative_groups AS ag ON (ag.id = aq.alternative_group_id)
                JOIN zones AS z ON (z.id = ag.zone_id)
            WHERE
                -- need assessment_instances_points.assessment_instance_id because just
                -- assessment_instance_id would be ambiguous (it has already been
                -- joined as a column to the table from which we are selecting)
                iq.assessment_instance_id = assessment_instances_points.assessment_instance_id
                -- drop deleted questions unless assessment type is Exam
                AND ((aq.deleted_at IS NULL) OR (assessment_type = 'Exam'))
        ), points_questions AS (
            SELECT
                allq.qid,
                allq.zid,
                allq.points,
                allq.zone_max_points
            FROM
                all_questions AS allq
            WHERE
                ((allq.points_rank <= allq.number_grade) OR (allq.number_grade IS NULL))
        ), max_points_questions AS (
            SELECT
                allq.qid,
                allq.zid,
                allq.max_points,
                allq.zone_max_points
            FROM
                all_questions AS allq
            WHERE
                ((allq.max_points_rank <= allq.number_grade) OR (allq.number_grade IS NULL))
        ), points_zones AS (
            SELECT
                ptsq.zid,
                LEAST(sum(ptsq.points), ptsq.zone_max_points) AS points,
                array_agg(ptsq.qid) AS qids
            FROM
                points_questions AS ptsq
            GROUP BY
                ptsq.zid,
                ptsq.zone_max_points
        ), max_points_zones AS (
            SELECT
                ptsq.zid,
                LEAST(sum(ptsq.max_points), ptsq.zone_max_points) AS max_points,
                array_agg(ptsq.qid) AS max_qids
            FROM
                max_points_questions AS ptsq
            GROUP BY
                ptsq.zid,
                ptsq.zone_max_points
        )
        SELECT
            pz.zid,
            pz.points,
            pz.qids,
            mpz.max_points,
            mpz.max_qids
        FROM
            points_zones AS pz
            INNER JOIN max_points_zones AS mpz USING (zid);
END;
$$ LANGUAGE plpgsql STABLE;
