-- BLOCK select_question
WITH course_staff AS (
    SELECT
        jsonb_agg(jsonb_build_object(
            'user_id', u.user_id,
            'uid', u.uid,
            'name', u.name) ORDER BY u.uid, u.name, u.user_id) AS course_staff
    FROM
        assessments AS a
        JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
        JOIN course_instance_permissions AS cip ON (cip.course_instance_id = ci.id)
        JOIN course_permissions AS cp ON (cp.id = cip.course_permission_id)
        JOIN users AS u ON (u.user_id = cp.user_id)
    WHERE
        a.id = $assessment_id
        AND cip.course_instance_role >= 'Student Data Editor'
),
open_instances AS (
    SELECT
        COUNT(*) AS num_open_instances
    FROM
        assessments AS a
        JOIN assessment_instances AS ai ON (ai.assessment_id = a.id)
    WHERE
        a.id = $assessment_id
        AND ai.open
)
SELECT
    q.id AS question_id,
    q.title AS question_title,
    admin_assessment_question_number(aq.id) as number_in_alternative_group,
    aq.max_points,
    COALESCE(cs.course_staff, '[]'::jsonb) AS course_staff,
    COALESCE(oi.num_open_instances, 0) AS num_open_instances
FROM
    assessment_questions AS aq
    JOIN questions AS q ON (q.id = aq.question_id)
    LEFT JOIN course_staff AS cs ON (TRUE)
    LEFT JOIN open_instances AS oi ON (TRUE)
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
    ai.open AS assessment_open,
    u.uid,
    COALESCE(agu.name, agu.uid) AS assigned_grader_name,
    COALESCE(lgu.name, lgu.uid) AS last_grader_name,
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

-- BLOCK update_instance_questions
WITH course_staff AS (
    SELECT
        cp.user_id
    FROM
        assessments AS a
        JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
        JOIN course_instance_permissions AS cip ON (cip.course_instance_id = ci.id)
        JOIN course_permissions AS cp ON (cp.id = cip.course_permission_id)
    WHERE
        a.id = $assessment_id
        AND cip.course_instance_role >= 'Student Data Editor'
)
UPDATE instance_questions AS iq
SET
    requires_manual_grading = $requires_manual_grading,
    assigned_grader = $assigned_grader
WHERE
    iq.assessment_question_id = $assessment_question_id
    AND iq.id = ANY($instance_question_ids::BIGINT[])
    AND ($assigned_grader::BIGINT IS NULL OR
         EXISTS (SELECT * FROM course_staff AS cs WHERE cs.user_id = $assigned_grader))
    ;
