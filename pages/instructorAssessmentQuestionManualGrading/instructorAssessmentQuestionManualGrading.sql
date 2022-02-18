-- BLOCK select_question
SELECT
    q.id AS question_id,
    q.title AS question_title,
    aq.max_points
FROM
    assessment_questions AS aq
    JOIN questions AS q ON (q.id = aq.question_id)
WHERE
    aq.assessment_id = $assessment_id
    AND aq.id = $assessment_question_id;


-- BLOCK select_instance_questions_manual_grading
SELECT
    iq.*,
    u.uid,
    COALESCE(g.name, u.name) AS user_or_group_name
FROM
    instance_questions AS iq
    JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
    LEFT JOIN users AS u ON (u.user_id = ai.user_id)
    LEFT JOIN groups AS g ON (g.id = ai.group_id)
WHERE
    ai.assessment_id = $assessment_id
    AND iq.assessment_question_id = $assessment_question_id
    AND EXISTS(SELECT 1
               FROM variant AS v JOIN submissions AS s ON (s.variant_id = v.id)
               WHERE v.instance_question_id = iq.id)
ORDER BY user_or_group_name, iq.id;
