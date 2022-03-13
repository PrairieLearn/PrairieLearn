-- BLOCK select_question
SELECT
    q.id AS question_id,
    q.title AS question_title,
    admin_assessment_question_number(aq.id) as number_in_alternative_group,
    aq.max_points
FROM
    assessment_questions AS aq
    JOIN questions AS q ON (q.id = aq.question_id)
WHERE
    aq.assessment_id = $assessment_id
    AND aq.id = $assessment_question_id;


-- BLOCK select_instance_questions_manual_grading
WITH issue_count AS (
    SELECT
        i.instance_question_id AS instance_question_id,
        count(*) AS open_issue_count
    FROM
        issues AS i
    WHERE
        i.assessment_id = $assessment_id
        AND i.course_caused
        AND i.open
    GROUP BY i.instance_question_id
)
SELECT
    iq.*,
    u.uid,
    agu.name AS assigned_grader_name,
    lgu.name AS last_grader_name,
    aq.max_points,
    COALESCE(g.name, u.name) AS user_or_group_name,
    ic.open_issue_count
FROM
    instance_questions AS iq
    JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
    JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
    LEFT JOIN users AS u ON (u.user_id = ai.user_id)
    LEFT JOIN groups AS g ON (g.id = ai.group_id)
    LEFT JOIN users AS agu ON (agu.user_id = iq.assigned_grader)
    LEFT JOIN users AS lgu ON (lgu.user_id = iq.last_grader)
    LEFT JOIN issue_count AS ic ON (ic.instance_question_id = iq.id)
WHERE
    ai.assessment_id = $assessment_id
    AND iq.assessment_question_id = $assessment_question_id
    AND EXISTS(SELECT 1
               FROM variants AS v JOIN submissions AS s ON (s.variant_id = v.id)
               WHERE v.instance_question_id = iq.id)
ORDER BY user_or_group_name, iq.id;
