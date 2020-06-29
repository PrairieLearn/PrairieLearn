-- Given an _instance_question_id, returns a boolean that's true if an
-- assessment's zone "sequence" configuration will block user access.
CREATE OR REPLACE FUNCTION
    instance_questions_check_sequence_blocked (
        _instance_question_id bigint
    ) RETURNS boolean AS $$
DECLARE
    _assessment_instance_id bigint;

    z_id bigint;
    z_sequence_enforce boolean;

    prev_iq_id bigint;

    start_of_zone boolean;

    prev_iq_score_perc DOUBLE PRECISION;
    prev_z_score_threshold DOUBLE PRECISION;
    prev_iq_score_met boolean;

BEGIN

    SELECT iq.assessment_instance_id INTO _assessment_instance_id
    FROM instance_questions iq
    WHERE iq.id = _instance_question_id;

    -- 1. Don't block if !sequence_enforce for this zone.
    SELECT z.id, (z.sequence_enforce = true) INTO z_id, z_sequence_enforce
    FROM instance_questions iq
        JOIN assessment_questions aq ON (aq.id = iq.assessment_question_id)
        JOIN alternative_groups ag ON (ag.id = aq.alternative_group_id)
        JOIN zones z ON (z.id = ag.zone_id)
    WHERE iq.id = _instance_question_id;
    IF (z_sequence_enforce IS NULL) OR (NOT z_sequence_enforce) THEN
        RETURN false;
    END IF;

    -- 2. Don't block if the question is the first in its zone.
    SELECT _prev_iq_id, _prev_iq_score_perc INTO prev_iq_id, prev_iq_score_perc
    FROM (
        SELECT
            iq.id AS cur_iq,
            (lag(iq.id) OVER w) AS _prev_iq_id,
            (lag(iq.score_perc) OVER w) AS _prev_iq_score_perc
        FROM
            assessment_instances AS ai
            JOIN assessments AS a ON (a.id = ai.assessment_id)
            JOIN instance_questions AS iq ON (iq.assessment_instance_id = ai.id)
            JOIN question_order(ai.id) AS qo ON (qo.instance_question_id = iq.id)
            JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
        WHERE
            ai.id IN (SELECT iq.assessment_instance_id FROM instance_questions iq WHERE iq.id = _instance_question_id)
        WINDOW
            w AS (ORDER BY qo.row_order)
    ) AS prev_iq
    WHERE cur_iq = _instance_question_id;
    -- Return false early if (prev_iq_id = null),
    -- i.e. if _instance_question_id is the first question in the assessment.
    IF prev_iq_id IS NULL THEN
        RETURN false;
    END IF;

    SELECT (z.id IS DISTINCT FROM z_id), z.sequence_score_perc_threshold INTO start_of_zone, prev_z_score_threshold
    FROM instance_questions iq
        JOIN assessment_questions aq ON (aq.id = iq.assessment_question_id)
        JOIN alternative_groups ag ON (ag.id = aq.alternative_group_id)
        JOIN zones z ON (z.id = ag.zone_id)
    WHERE iq.id = prev_iq_id;
    IF start_of_zone THEN
        RETURN false;
    END IF;

    -- 3. Don't block if the score of the previous question
    -- is greater than or equal to the score threshold.
    SELECT (prev_iq_score_perc >= prev_z_score_threshold) INTO prev_iq_score_met;
    IF prev_iq_score_met THEN
        RETURN false;
    END IF;

    RETURN true;
END;
$$ LANGUAGE plpgsql STABLE;
