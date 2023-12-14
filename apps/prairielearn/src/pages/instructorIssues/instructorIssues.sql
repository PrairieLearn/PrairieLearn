-- BLOCK issues_count
WITH
  counts AS (
    SELECT
      i.open,
      count(*)::int
    FROM
      issues AS i
    WHERE
      i.course_id = $course_id
      AND i.course_caused
    GROUP BY
      i.open
  )
SELECT
  open,
  coalesce(count, 0) AS count
FROM
  (
    VALUES
      (true),
      (false)
  ) AS tmp (open)
  LEFT JOIN counts USING (open)
ORDER BY
  open;

-- BLOCK select_issues
SELECT
  i.id AS issue_id,
  format_date_iso8601 (
    now(),
    coalesce(ci.display_timezone, c.display_timezone)
  ) AS now_date,
  format_date_iso8601 (
    i.date,
    coalesce(ci.display_timezone, c.display_timezone)
  ) AS formatted_date,
  ci.short_name AS course_instance_short_name,
  ci.id AS course_instance_id,
  a.id AS assessment_id,
  CASE
    WHEN i.assessment_id IS NOT NULL THEN assessments_format (i.assessment_id)
    ELSE NULL
  END AS assessment,
  i.question_id,
  i.instance_question_id,
  iq.assessment_instance_id,
  i.course_instance_id,
  q.directory AS question_qid,
  u.uid AS user_uid,
  u.name AS user_name,
  i.student_message,
  i.variant_id,
  v.variant_seed,
  i.open,
  i.manually_reported,
  COUNT(*) OVER () AS issue_count
FROM
  issues_select_with_filter (
    $course_id,
    $filter_is_open,
    $filter_is_closed,
    $filter_manually_reported,
    $filter_automatically_reported,
    $filter_qids,
    $filter_not_qids,
    $filter_users,
    $filter_not_users,
    $filter_query_text
  ) AS selected_issues
  JOIN issues AS i ON (i.id = selected_issues.issue_id)
  JOIN pl_courses AS c ON (c.id = i.course_id)
  LEFT JOIN course_instances AS ci ON (ci.id = i.course_instance_id)
  LEFT JOIN assessments AS a ON (a.id = i.assessment_id)
  LEFT JOIN questions AS q ON (q.id = i.question_id)
  LEFT JOIN users AS u ON (u.user_id = i.user_id)
  LEFT JOIN instance_questions AS iq ON (iq.id = i.instance_question_id)
  LEFT JOIN variants AS v ON (v.id = i.variant_id)
WHERE
  i.course_caused
ORDER BY
  i.date DESC,
  i.id DESC
LIMIT
  $limit
OFFSET
  $offset;

-- BLOCK close_issues
WITH
  updated_issues AS (
    UPDATE issues AS e
    SET
      open = FALSE
    WHERE
      e.course_id = $course_id
      AND e.course_caused
      AND e.open IS TRUE
      AND e.id = ANY ($issue_ids::BIGINT[])
    RETURNING
      e.id,
      e.open
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
