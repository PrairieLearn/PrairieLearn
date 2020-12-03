UPDATE variants AS v
SET
    broken = true,
    open = true
WHERE id IN (
    SELECT v.id
    FROM
        variants v
        JOIN instance_questions iq ON v.instance_question_id = iq.id
        JOIN assessment_questions aq ON iq.assessment_question_id = aq.id
    WHERE
        v.open = true
        AND v.broken = false
        AND aq.id = $assessment_question_id
)
RETURNING v.id AS updated_variant_id;