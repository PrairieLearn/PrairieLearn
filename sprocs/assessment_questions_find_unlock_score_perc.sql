-- Given an instance question id `iq_id`, determines the minimum score
-- necessary to continue based on its:
-- > Assessment question
-- > Alternative group
-- > Zone
-- > Assessment
CREATE OR REPLACE FUNCTION
    assessment_questions_find_unlock_score_perc (
        aq_id bigint
    ) RETURNS double precision AS $$
DECLARE
    ret_min_advance_perc double precision;
    a_min_advance_perc double precision;
    prev_z_min_advance_perc double precision;
    prev_ag_min_advance_perc double precision;
    prev_aq_min_advance_perc double precision;
BEGIN
    SELECT
        a.min_advance_perc,
        z.min_advance_perc,
        ag.min_advance_perc,
        aq.min_advance_perc
    INTO
        a_min_advance_perc,
        prev_z_min_advance_perc,
        prev_ag_min_advance_perc,
        prev_aq_min_advance_perc
    FROM assessment_questions aq
        JOIN alternative_groups ag ON (ag.id = aq.alternative_group_id)
        JOIN zones z ON (z.id = ag.zone_id)
        JOIN assessments a ON (a.id = aq.assessment_id)
    WHERE aq.id = aq_id;

    -- Store the lowest-level non-null `min_advance_perc`
    SELECT 0 INTO ret_min_advance_perc;
    IF a_min_advance_perc IS NOT NULL THEN
        SELECT a_min_advance_perc INTO ret_min_advance_perc;
    END IF;
    IF prev_z_min_advance_perc IS NOT NULL THEN
        SELECT prev_z_min_advance_perc INTO ret_min_advance_perc;
    END IF;
    IF prev_ag_min_advance_perc IS NOT NULL THEN
        SELECT prev_ag_min_advance_perc INTO ret_min_advance_perc;
    END IF;
    IF prev_aq_min_advance_perc IS NOT NULL THEN
        SELECT prev_aq_min_advance_perc INTO ret_min_advance_perc;
    END IF;

    RETURN ret_min_advance_perc;
END;
$$ LANGUAGE plpgsql STABLE;
