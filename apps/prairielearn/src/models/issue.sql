-- BLOCK select_issue_summaries_by_ids
SELECT
  i.id,
  i.open,
  i.student_message,
  q.qid AS question_qid
FROM
  issues AS i
  LEFT JOIN questions AS q ON (q.id = i.question_id)
WHERE
  i.course_id = $course_id
  AND i.course_caused
  AND i.id = ANY ($issue_ids::bigint[])
ORDER BY
  i.date,
  i.id;

-- BLOCK update_issues_open
WITH
  matching_issues AS (
    SELECT
      i.id,
      i.open
    FROM
      issues AS i
    WHERE
      i.course_id = $course_id
      AND i.course_caused
      AND i.id = ANY ($issue_ids::bigint[])
    FOR NO KEY UPDATE
  ),
  updated_issues AS (
    UPDATE issues AS i
    SET
      open = $open
    FROM
      matching_issues AS mi
    WHERE
      i.id = mi.id
      AND mi.open IS DISTINCT FROM $open
    RETURNING
      i.id,
      mi.open AS old_open
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
      $course_id,
      'issues',
      'open',
      ui.id,
      'update',
      jsonb_build_object('open', $open::boolean),
      jsonb_build_object('open', ui.old_open),
      jsonb_build_object('open', $open::boolean)
    FROM
      updated_issues AS ui
  )
SELECT
  (
    SELECT
      COUNT(*)
    FROM
      matching_issues
  )::integer AS matched,
  (
    SELECT
      COUNT(*)
    FROM
      updated_issues
  )::integer AS updated;
