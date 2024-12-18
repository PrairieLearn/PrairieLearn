-- BLOCK select_auth_data_from_workspace
SELECT
  v.question_id,
  v.instance_question_id,
  v.course_instance_id,
  v.course_id,
  v.user_id AS variant_user_id,
  q.qid AS question_qid,
  q.share_publicly AS share_publicly,
  q.share_source_publicly AS share_source_publicly,
  iq.assessment_instance_id
FROM
  workspaces AS w
  JOIN variants AS v ON (w.id = v.workspace_id)
  JOIN questions AS q ON (v.question_id = q.id)
  LEFT JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
WHERE
  w.id = $workspace_id;
