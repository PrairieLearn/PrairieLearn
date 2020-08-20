-- BLOCK select_auth_data_from_workspace
SELECT
    v.question_id,
    v.instance_question_id,
    v.course_instance_id,
    q.course_id,
    iq.assessment_instance_id
FROM
    workspaces AS w
    JOIN variants AS v on (w.id = v.workspace_id)
    JOIN questions AS q on (v.question_id = q.id)
    LEFT JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
WHERE
    w.id = $workspace_id;
