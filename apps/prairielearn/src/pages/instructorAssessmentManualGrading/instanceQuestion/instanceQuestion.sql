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

-- BLOCK select_instance_question_ids_in_group
SELECT
  iq.id AS instance_question_id,
  s.id AS submission_id
FROM
  instance_questions AS iq
  JOIN assessment_instances AS ai ON ai.id = iq.assessment_instance_id
  JOIN variants AS v ON v.instance_question_id = iq.id
  JOIN submissions AS s ON s.variant_id = v.id
WHERE
  COALESCE(
    iq.manual_instance_question_group_id,
    iq.ai_instance_question_group_id
  ) = $selected_instance_question_group_id
  AND ai.assessment_id = $assessment_id
  -- If skipping graded submissions, only include instance questions that require manual grading. 
  AND (
    NOT $skip_graded_submissions
    OR iq.requires_manual_grading
  );
