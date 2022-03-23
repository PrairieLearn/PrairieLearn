-- BLOCK select_next_ungraded_instance_question
WITH prior_instance_question AS (
    SELECT
        iq.*,
        COALESCE(g.name, u.name) AS prior_user_or_group_name
    FROM
        instance_questions AS iq
        LEFT JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
        LEFT JOIN users AS u ON (u.user_id = ai.user_id)
        LEFT JOIN groups AS g ON (g.id = ai.group_id)
    WHERE iq.id = $prior_instance_question_id
)
SELECT
    iq.*,
    COALESCE(g.name, u.name) AS user_or_group_name
FROM
    instance_questions AS iq
    JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
    LEFT JOIN users AS u ON (u.user_id = ai.user_id)
    LEFT JOIN groups AS g ON (g.id = ai.group_id)
    LEFT JOIN prior_instance_question AS piq ON (TRUE)
WHERE
    iq.assessment_question_id = $assessment_question_id
    AND ai.assessment_id = $assessment_id -- since assessment_question_id is not authz'ed
    AND ($prior_instance_question_id::BIGINT IS NULL OR iq.id != $prior_instance_question_id)
    AND iq.requires_manual_grading
    AND (iq.assigned_grader = $user_id OR iq.assigned_grader IS NULL)
    AND EXISTS(SELECT 1
               FROM variants AS v JOIN submissions AS s ON (s.variant_id = v.id)
               WHERE v.instance_question_id = iq.id)
ORDER BY
    -- Choose one assigned to current user if one exists, unassigned if not
    iq.assigned_grader NULLS LAST,
    -- Choose question that list after the prior if one exists (follow the order in the instance list)
    (COALESCE(g.name, u.name), iq.id) > (piq.prior_user_or_group_name, piq.id) DESC,
    user_or_group_name,
    iq.id
LIMIT 1;
