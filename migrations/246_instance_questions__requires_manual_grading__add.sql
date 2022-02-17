ALTER TABLE instance_questions ADD COLUMN IF NOT EXISTS requires_manual_grading BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE instance_questions ADD COLUMN IF NOT EXISTS assigned_grader BIGINT;

UPDATE instance_questions AS iq
SET
    requires_manual_grading = TRUE
FROM
    variants AS v,
    assessment_instances AS ai
WHERE
    v.instance_question_id = iq.id
    AND ai.id = iq.assessment_instance_id
    AND NOT ai.open
    AND NOT EXISTS (SELECT 1
                    FROM submissions AS s
                    WHERE s.variant_id = v.id
                          AND s.graded_at IS NOT NULL);
