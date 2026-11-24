-- BLOCK insert_issue
INSERT INTO
  issues (
    course_id,
    question_id,
    course_caused,
    open,
    manually_reported,
    student_message
  )
SELECT
  $course_id,
  q.id,
  $course_caused,
  $open,
  TRUE,
  $student_message
FROM
  questions AS q
WHERE
  q.course_id = $course_id
  AND q.qid = 'addNumbers'
RETURNING
  id;

-- BLOCK select_issues_open
SELECT
  i.open
FROM
  issues AS i
WHERE
  i.id = ANY ($issue_ids::bigint[])
ORDER BY
  i.id;

-- BLOCK select_issue_audit_log_count
SELECT
  COUNT(*)::integer
FROM
  audit_logs AS al
WHERE
  al.table_name = 'issues'
  AND al.row_id = ANY ($issue_ids::bigint[])
  AND al.authn_user_id = $authn_user_id;

-- BLOCK insert_preview_variant
INSERT INTO
  variants (
    question_id,
    course_id,
    authn_user_id,
    user_id,
    variant_seed,
    params,
    true_answer,
    options
  )
SELECT
  q.id,
  q.course_id,
  $user_id,
  $user_id,
  'seed',
  '{}',
  '{}',
  '{}'
FROM
  questions AS q
WHERE
  q.course_id = 1
  AND q.qid = 'addNumbers'
RETURNING
  id;

-- BLOCK select_issue
SELECT
  i.variant_id,
  i.open,
  i.manually_reported,
  i.course_caused,
  i.student_message,
  i.instructor_message,
  i.user_id,
  i.authn_user_id
FROM
  issues AS i
WHERE
  i.id = $issue_id;
