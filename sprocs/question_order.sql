CREATE FUNCTION
    question_order (
        arg_assessment_instance_id BIGINT
    ) RETURNS TABLE (
        instance_question_id BIGINT,
        row_order INTEGER,
        question_number TEXT,
        sequence_locked BOOLEAN
    )
AS $$
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
)
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
    -- Advancement locking rule 2:
    ( -- Lock only if:
        -- Not the first question in the assessment
        ((lag(aq.id) OVER w) IS NOT NULL)
        AND -- Any previous question locks all questions ahead of it
        (BOOL_OR(locks_next.locking) OVER (ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING))
    ) AS sequence_locked
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
    );
$$ LANGUAGE SQL STABLE;
