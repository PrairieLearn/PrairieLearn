-- Given an instance question id `iq_id`, determines the minimum score
-- necessary to continue based on its:
-- > Assessment question
-- > Alternative group
-- > Zone
-- > Assessment
CREATE OR REPLACE FUNCTION
    instance_questions_determine_unblock_score_perc (
        iq_id bigint
    ) RETURNS double precision AS $$
DECLARE
    ret_mincontsp double precision;
    a_mincontsp double precision;
    prev_z_mincontsp double precision;
    prev_ag_mincontsp double precision;
    prev_aq_mincontsp double precision;
BEGIN
    SELECT
        a.min_continue_score_perc,
        z.min_continue_score_perc,
        ag.min_continue_score_perc,
        aq.min_continue_score_perc
    INTO
        a_mincontsp,
        prev_z_mincontsp,
        prev_ag_mincontsp,
        prev_aq_mincontsp
    FROM instance_questions iq
        JOIN assessment_questions aq ON (aq.id = iq.assessment_question_id)
        JOIN alternative_groups ag ON (ag.id = aq.alternative_group_id)
        JOIN zones z ON (z.id = ag.zone_id)
        JOIN assessments a ON (a.id = aq.assessment_id)
    WHERE iq.id = iq_id;

    -- Store the lowest-level non-null `min_continue_score_perc`
    SELECT 0 INTO ret_mincontsp;
    IF a_mincontsp IS NOT NULL THEN
        SELECT a_mincontsp INTO ret_mincontsp;
    END IF;
    IF prev_z_mincontsp IS NOT NULL THEN
        SELECT prev_z_mincontsp INTO ret_mincontsp;
    END IF;
    IF prev_ag_mincontsp IS NOT NULL THEN
        SELECT prev_ag_mincontsp INTO ret_mincontsp;
    END IF;
    IF prev_aq_mincontsp IS NOT NULL THEN
        SELECT prev_aq_mincontsp INTO ret_mincontsp;
    END IF;

    RETURN ret_mincontsp;
END;
$$ LANGUAGE plpgsql STABLE;
