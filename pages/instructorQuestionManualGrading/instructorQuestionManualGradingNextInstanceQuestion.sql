-- BLOCK get_next_ungraded_instance_question
SELECT * FROM (SELECT DISTINCT ON (iq.id)
    iq.*,
    s.graded_at,
    ai.id AS assessment_instance_id
FROM
    instance_questions AS iq
    JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
    JOIN variants AS v ON (v.instance_question_id = iq.id)
    JOIN submissions s ON (s.variant_id = v.id)
WHERE
    ai.assessment_id = $assessment_id
    AND iq.assessment_question_id = $assessment_question_id
ORDER BY iq.id DESC, s.date DESC, s.id DESC) AS submission_info
WHERE submission_info.graded_at is NULL
LIMIT 1;
