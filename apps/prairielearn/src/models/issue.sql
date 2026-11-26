-- BLOCK select_issue_summaries_by_ids
SELECT
  i.id,
  i.open,
  q.qid AS question_qid
FROM
  issues AS i
  LEFT JOIN questions AS q ON (q.id = i.question_id)
WHERE
  i.course_id = $course_id
  AND i.course_caused
  AND i.id = ANY ($issue_ids::bigint[])
ORDER BY
  i.id;

-- BLOCK close_issues
WITH
  updated_issues AS (
    UPDATE issues AS i
    SET
      open = FALSE
    WHERE
      i.course_id = $course_id
      AND i.course_caused
      AND i.open IS TRUE
      AND i.id = ANY ($issue_ids::bigint[])
    RETURNING
      i.id,
      i.open
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
        new_state
      )
    SELECT
      $authn_user_id,
      $course_id,
      'issues',
      'open',
      i.id,
      'update',
      jsonb_build_object('course_id', $course_id),
      jsonb_build_object('open', i.open)
    FROM
      updated_issues AS i
  )
SELECT
  COUNT(*)::integer
FROM
  updated_issues;

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
