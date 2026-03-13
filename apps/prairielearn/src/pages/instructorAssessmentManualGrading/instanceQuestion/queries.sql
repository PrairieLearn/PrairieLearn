-- BLOCK select_submission_and_variant_for_grading
SELECT
  s.id AS submission_id,
  s.feedback AS submission_feedback,
  s.manual_rubric_grading_id AS submission_manual_rubric_grading_id,
  s.true_answer AS submission_true_answer,
  s.params AS submission_params,
  s.submitted_answer AS submission_submitted_answer,
  v.params AS variant_params,
  v.true_answer AS variant_true_answer
FROM
  variants AS v
  JOIN submissions AS s ON (s.variant_id = v.id)
WHERE
  v.instance_question_id = $instance_question_id
ORDER BY
  v.date DESC,
  s.date DESC
LIMIT
  1;

-- BLOCK select_ai_grading_job_data_for_submission
SELECT
  gj.id,
  gj.manual_rubric_grading_id,
  agj.prompt,
  agj.completion,
  agj.rotation_correction_degrees
FROM
  grading_jobs AS gj
  LEFT JOIN ai_grading_jobs AS agj ON (agj.grading_job_id = gj.id)
WHERE
  submission_id = $submission_id
  AND grading_method = 'AI'
  AND gj.deleted_at IS NULL
ORDER BY
  gj.date DESC
LIMIT
  1;

-- BLOCK select_exists_manual_grading_job_for_submission
SELECT
  EXISTS (
    SELECT
      1
    FROM
      grading_jobs AS gj
    WHERE
      gj.submission_id = $submission_id
      AND gj.grading_method = 'Manual'
      AND gj.deleted_at IS NULL
  );

-- BLOCK select_open_issues_for_instance_question
SELECT
  i.id,
  i.open
FROM
  issues AS i
WHERE
  i.instance_question_id = $instance_question_id
  AND i.course_caused
  AND i.open IS TRUE;

-- BLOCK select_grading_job_data
SELECT
  gj.*,
  gj.score * 100 AS score_perc,
  COALESCE(u.name, u.uid) AS grader_name
FROM
  grading_jobs AS gj
  JOIN submissions AS s ON (s.id = gj.submission_id)
  JOIN variants AS v ON (v.id = s.variant_id)
  LEFT JOIN users AS u ON (u.id = gj.auth_user_id)
  JOIN course_instances AS ci ON (ci.id = v.course_instance_id)
WHERE
  gj.id = $grading_job_id
  AND v.instance_question_id = $instance_question_id;

-- BLOCK select_submission_credit_values
SELECT DISTINCT
  s.credit
FROM
  assessment_instances AS ai
  JOIN instance_questions AS iq ON (iq.assessment_instance_id = ai.id)
  JOIN variants AS v ON (v.instance_question_id = iq.id)
  JOIN submissions AS s ON (s.variant_id = v.id)
WHERE
  ai.id = $assessment_instance_id
  AND s.credit IS NOT NULL;
