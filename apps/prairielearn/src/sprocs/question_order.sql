CREATE FUNCTION
    question_order (
        arg_assessment_instance_id bigint
    ) RETURNS TABLE (
        instance_question_id bigint,
        row_order integer,
        question_number text,
        question_access_mode text
    )
AS $$
BEGIN
RETURN QUERY
-- Used to determine if an instance question should block
-- access to further questions when advanceScorePerc is set.
WITH locks_next AS (
    SELECT
        iq.id AS instance_question_id,
        -- Advancement locking rule 1:
        NOT ( -- Do not lock next question if:
            -- Run out of attempts
            (iq.open = false)
            OR -- Score >= unlock score
            (100*COALESCE(iq.highest_submission_score, 0)
                >= aq.effective_advance_score_perc) 
        ) AS locking
    FROM
        assessment_instances ai
        JOIN instance_questions AS iq ON (iq.assessment_instance_id = ai.id)
        JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
    WHERE
        ai.id = arg_assessment_instance_id
),
lockpoint_info AS (
    SELECT
        z.id AS zone_id,
        z.number AS zone_number,
        aicl.id IS NOT NULL AS is_crossed
    FROM
        zones z
        LEFT JOIN assessment_instance_crossed_lockpoints aicl ON aicl.zone_id = z.id
        AND aicl.assessment_instance_id = arg_assessment_instance_id
    WHERE
        z.assessment_id = (
            SELECT
                assessment_id
            FROM
                assessment_instances
            WHERE
                id = arg_assessment_instance_id
        )
        AND z.lockpoint = true
),
first_uncrossed_lockpoint AS (
    SELECT
        MIN(zone_number) AS zone_number
    FROM
        lockpoint_info
    WHERE
        NOT is_crossed
),
question_state AS (
    SELECT
        iq.id AS instance_question_id,
        (row_number() OVER w)::integer AS row_order,
        CASE
            WHEN a.type = 'Homework' THEN
                CASE
                    WHEN a.shuffle_questions THEN '#' || q.number::text
                    ELSE aset.abbreviation || a.number || '.' || (row_number() OVER w)::text
                END
            WHEN a.type = 'Exam' THEN (row_number() OVER w)::text
            ELSE aq.number::text
        END AS question_number,
        -- Advancement locking rule 2: lock if not the first question and
        -- any previous question locks all questions ahead of it.
        (
            ((lag(aq.id) OVER w) IS NOT NULL)
            AND (BOOL_OR(locks_next.locking) OVER (ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING))
        ) AS sequence_locked,
        COALESCE(z.number >= first_uncrossed_lockpoint.zone_number, false) AS lockpoint_not_yet_crossed,
        EXISTS (
            SELECT
                1
            FROM
                lockpoint_info
            WHERE
                is_crossed
                AND zone_number > z.number
        ) AS lockpoint_read_only
    FROM
        assessment_instances AS ai
        JOIN assessments AS a ON (a.id = ai.assessment_id)
        JOIN instance_questions AS iq ON (iq.assessment_instance_id = ai.id)
        JOIN locks_next ON (locks_next.instance_question_id = iq.id)
        JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
        JOIN questions AS q ON (q.id = aq.question_id)
        JOIN alternative_groups AS ag ON (ag.id = aq.alternative_group_id)
        JOIN zones AS z ON (z.id = ag.zone_id)
        JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
        CROSS JOIN first_uncrossed_lockpoint
    WHERE
        ai.id = arg_assessment_instance_id
        AND aq.deleted_at IS NULL
    WINDOW
        w AS (
            ORDER BY
                z.number,
                CASE
                    WHEN (a.type = 'Homework' OR a.type = 'Exam') THEN
                        CASE
                            WHEN a.shuffle_questions THEN iq.order_by
                            ELSE aq.number
                        END
                    ELSE aq.number
                END,
                iq.id
        )
)
SELECT
    question_state.instance_question_id,
    question_state.row_order,
    question_state.question_number,
    CASE
        WHEN question_state.sequence_locked THEN 'blocked_sequence'
        WHEN question_state.lockpoint_not_yet_crossed THEN 'blocked_lockpoint'
        WHEN question_state.lockpoint_read_only THEN 'read_only_lockpoint'
        ELSE 'default'
    END AS question_access_mode
FROM
    question_state;
END;
$$ LANGUAGE plpgsql STABLE;
