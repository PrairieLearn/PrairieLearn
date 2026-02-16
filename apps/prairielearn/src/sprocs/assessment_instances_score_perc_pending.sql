CREATE FUNCTION
    assessment_instances_score_perc_pending(
        IN assessment_instance_id bigint
    ) RETURNS double precision
AS $$
DECLARE
    max_points DOUBLE PRECISION;
    pending_points DOUBLE PRECISION;
BEGIN
    SELECT ai.max_points INTO max_points
    FROM assessment_instances AS ai
    WHERE ai.id = assessment_instance_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No assessment_instance found with id: %', assessment_instance_id;
    END IF;

    WITH
        tpz AS (SELECT * FROM assessment_instances_points(assessment_instance_id)),
        used_iq AS (
            SELECT
                tpz.zid,
                unnest(tpz.max_iq_ids) AS iq_id
            FROM tpz
        ),
        pending_by_zone AS (
            SELECT
                u.zid,
                CASE
                    WHEN z.max_points IS NULL THEN
                        sum(
                            CASE
                                WHEN
                                    COALESCE(aq.max_manual_points, 0) > 0
                                    AND iq.requires_manual_grading
                                THEN COALESCE(aq.max_manual_points, 0)
                                ELSE 0
                            END
                        )
                    ELSE
                        LEAST(
                            sum(
                                CASE
                                    WHEN
                                        COALESCE(aq.max_manual_points, 0) > 0
                                        AND iq.requires_manual_grading
                                    THEN COALESCE(aq.max_manual_points, 0)
                                    ELSE 0
                                END
                            ),
                            z.max_points
                        )
                END AS pending_points
            FROM
                used_iq AS u
                JOIN zones AS z ON (z.id = u.zid)
                LEFT JOIN instance_questions AS iq ON (iq.id = u.iq_id)
                LEFT JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
            GROUP BY
                u.zid,
                z.max_points
        )
    SELECT COALESCE(sum(pending_by_zone.pending_points), 0) INTO pending_points
    FROM pending_by_zone;

    RETURN CASE
        WHEN max_points IS NULL OR max_points <= 0 THEN 0
        ELSE
            LEAST(
                100,
                GREATEST(
                    0,
                    pending_points / max_points * 100
                )
            )
        END;
END;
$$ LANGUAGE plpgsql STABLE;
