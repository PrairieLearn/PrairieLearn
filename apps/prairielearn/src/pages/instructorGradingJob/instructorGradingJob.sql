-- BLOCK select_job
SELECT
  to_jsonb(gj.*) AS grading_job,
  q.id AS question_id,
  q.qid AS question_qid,
  u.uid AS user_uid,
  v.id AS variant_id,
  v.instance_question_id,
  to_jsonb(a.*) AS assessment,
  to_jsonb(ai.*) AS assessment_instance,
  (
    SELECT
      jsonb_agg(to_jsonb(gu.*))
    FROM
      group_users AS gu
    WHERE
      gu.group_id = ai.group_id
  ) AS assessment_instance_group_users
FROM
  grading_jobs AS gj
  JOIN submissions AS s ON (s.id = gj.submission_id)
  JOIN variants AS v ON (v.id = s.variant_id)
  JOIN pl_courses AS c ON (c.id = v.course_id)
  JOIN questions AS q ON (q.id = v.question_id)
  LEFT JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
  LEFT JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
  LEFT JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
  LEFT JOIN assessments AS a ON (a.id = ai.assessment_id)
  LEFT JOIN course_instances AS ci ON (ci.id = v.course_instance_id)
  LEFT JOIN users AS u ON (u.user_id = s.auth_user_id)
WHERE
  gj.id = $job_id
  AND gj.grading_method = 'External'
  AND c.id = $course_id
  AND ci.id IS NOT DISTINCT FROM $course_instance_id;
