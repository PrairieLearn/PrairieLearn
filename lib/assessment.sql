-- BLOCK check_belongs
SELECT
    ai.id
FROM
    assessment_instances AS ai
    JOIN assessments AS a ON (a.id = ai.assessment_id)
WHERE
    ai.id = $assessment_instance_id
    AND a.id = $assessment_id;


-- BLOCK select_assessment_for_grading_job
SELECT
    ai.id AS assessment_instance_id
FROM
    grading_jobs AS gj
    JOIN submissions AS s ON (s.id = gj.submission_id)
    JOIN variants AS v ON (v.id = s.variant_id)
    LEFT JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
    LEFT JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
WHERE
    gj.id = $grading_job_id;

-- BLOCK select_single_assessment_instance
SELECT
    ai.*
FROM
    assessment_instances AS ai
    LEFT JOIN groups AS g ON (g.id = ai.group_id AND g.deleted_at IS NULL)
    LEFT JOIN group_users AS gu ON (gu.group_id = g.id)
WHERE
    ai.assessment_id = $assessment_id
    AND ai.number = 1
    AND ((gu.user_id = $user_id) OR (ai.user_id = $user_id));
