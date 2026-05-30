-- BLOCK insert_issue
INSERT INTO
  issues AS i (
    student_message,
    instructor_message,
    course_caused,
    course_data,
    system_data,
    authn_user_id,
    instance_question_id,
    course_id,
    course_instance_id,
    question_id,
    assessment_id,
    user_id,
    variant_id,
    manually_reported
  )
SELECT
  $student_message,
  $instructor_message,
  $course_caused,
  $course_data::jsonb,
  $system_data::jsonb,
  $authn_user_id,
  v.instance_question_id,
  v.course_id,
  v.course_instance_id,
  v.question_id,
  ai.assessment_id,
  $user_id,
  $variant_id,
  $manually_reported
FROM
  variants AS v
  LEFT JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
  LEFT JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
WHERE
  v.id = $variant_id
RETURNING
  i.id;

-- BLOCK update_issue_open
WITH
  previous_issue_data AS (
    SELECT
      i.*
    FROM
      issues AS i
    WHERE
      i.id = $issue_id
      AND i.course_caused
      AND i.course_id = $course_id
  ),
  updated_issue AS (
    UPDATE issues AS i
    SET
      open = $new_open
    FROM
      previous_issue_data AS pi
    WHERE
      i.id = pi.id
    RETURNING
      i.id
  ),
  inserted_audit_logs AS (
    INSERT INTO
      audit_logs (
        authn_user_id,
        course_id,
        table_name,
        column_name,
        row_id,
        action,
        parameters,
        old_state,
        new_state
      )
    SELECT
      $authn_user_id,
      pi.course_id,
      'issues',
      'open',
      pi.id,
      'update',
      jsonb_build_object('open', $new_open),
      jsonb_build_object('open', pi.open),
      jsonb_build_object('open', $new_open)
    FROM
      previous_issue_data AS pi
  )
SELECT
  id
FROM
  updated_issue;
