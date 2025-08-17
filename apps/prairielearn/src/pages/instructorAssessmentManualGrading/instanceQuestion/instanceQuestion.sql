-- BLOCK select_grading_job_data
SELECT
  gj.*,
  gj.score * 100 AS score_perc,
  COALESCE(u.name, u.uid) AS grader_name
FROM
  grading_jobs AS gj
  JOIN submissions AS s ON (s.id = gj.submission_id)
  JOIN variants AS v ON (v.id = s.variant_id)
  LEFT JOIN users AS u ON (u.user_id = gj.auth_user_id)
  JOIN course_instances AS ci ON (ci.id = v.course_instance_id)
WHERE
  gj.id = $grading_job_id
  AND v.instance_question_id = $instance_question_id;

-- BLOCK select_variant_with_last_submission
SELECT
  v.id AS variant_id
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

-- BLOCK update_assigned_grader
UPDATE instance_questions AS iq
SET
  requires_manual_grading = $requires_manual_grading::boolean,
  assigned_grader = CASE
    WHEN $requires_manual_grading::boolean THEN $assigned_grader::bigint
    ELSE assigned_grader
  END
WHERE
  iq.id = $instance_question_id;

-- BLOCK close_issues_for_instance_question
WITH
  updated_issues AS (
    UPDATE issues AS i
    SET
      open = FALSE
    WHERE
      i.instance_question_id = $instance_question_id
      AND i.course_caused
      AND i.open IS TRUE
      AND i.id = ANY ($issue_ids::bigint[])
    RETURNING
      i.id,
      i.course_id,
      i.open
  )
INSERT INTO
  audit_logs (
    authn_user_id,
    course_id,
    table_name,
    column_name,
    row_id,
    action,
    parameters,
    new_state
  )
SELECT
  $authn_user_id,
  i.course_id,
  'issues',
  'open',
  i.id,
  'update',
  jsonb_build_object('instance_question_id', $instance_question_id),
  jsonb_build_object('open', i.open)
FROM
  updated_issues AS i;

-- BLOCK select_ai_grading_job_data_for_submission
SELECT
  gj.id,
  gj.manual_rubric_grading_id,
  agj.prompt
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
