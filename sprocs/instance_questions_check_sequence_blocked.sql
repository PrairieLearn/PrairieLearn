-- Given an instance question id `iq_id`, returns a boolean that's true if an
-- assessment's zone "sequence" configuration will block user access.
CREATE OR REPLACE FUNCTION
    instance_questions_check_sequence_blocked (
        iq_id bigint
    ) RETURNS boolean AS $$
DECLARE
    ai_id bigint;
    prev_iq_id bigint;
    prev_iq_highest_submission_score double precision;
    relevant_min_advance_perc double precision;
    prev_iq_score_met boolean;

BEGIN

    SELECT iq.assessment_instance_id INTO ai_id
    FROM instance_questions iq
    WHERE iq.id = iq_id;

    -- 1. Get the id and score_perc of the previous instance question in the assessment.
    SELECT _prev_iq_id, _prev_iq_highest_submission_score INTO prev_iq_id, prev_iq_highest_submission_score
    FROM (
        SELECT
            iq.id AS cur_iq,
            (lag(iq.id) OVER w) AS _prev_iq_id,
            (lag(iq.highest_submission_score) OVER w) AS _prev_iq_highest_submission_score
        FROM
            assessment_instances AS ai
            JOIN assessments AS a ON (a.id = ai.assessment_id)
            JOIN instance_questions AS iq ON (iq.assessment_instance_id = ai.id)
            JOIN question_order(ai.id) AS qo ON (qo.instance_question_id = iq.id)
            JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
        WHERE
            ai.id IN (SELECT iq.assessment_instance_id FROM instance_questions iq WHERE iq.id = iq_id)
        WINDOW
            w AS (ORDER BY qo.row_order)
    ) AS prev_iq
    WHERE cur_iq = iq_id;

    -- Return false early if iq_id is the first question in the assessment.
    IF prev_iq_id IS NULL THEN
        RETURN false;
    END IF;

    -- Treat null as 0 for comparison logic
    IF prev_iq_highest_submission_score IS NULL THEN
        SELECT 0 INTO prev_iq_highest_submission_score;
    END IF;

    -- 2. Store the lowest-level non-null `min_advance_perc`
    SELECT instance_questions_determine_unblock_score_perc(prev_iq_id) INTO relevant_min_advance_perc;

    -- 3. Don't block if the score of the previous question
    -- is greater than or equal to the minimum score to continue.
    SELECT (prev_iq_highest_submission_score >= relevant_min_advance_perc) INTO prev_iq_score_met;
    RETURN NOT prev_iq_score_met;
END;
$$ LANGUAGE plpgsql STABLE;
