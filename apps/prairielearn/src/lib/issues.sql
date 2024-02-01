-- BLOCK open_close_all_issues_for_course
WITH
  updated_issues AS (
    UPDATE issues AS i
    SET
      open = $open
    WHERE
      i.course_id = $course_id
      AND i.course_caused
      AND i.open IS DISTINCT FROM $open
    RETURNING
      i.*
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
  jsonb_build_object('course_id', $course_id),
  jsonb_build_object('open', i.open)
FROM
  updated_issues AS i;
