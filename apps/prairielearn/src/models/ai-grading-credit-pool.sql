-- BLOCK select_credit_pool
SELECT
  credit_transferable_milli_dollars,
  credit_non_transferable_milli_dollars,
  (
    credit_transferable_milli_dollars + credit_non_transferable_milli_dollars
  ) AS total_milli_dollars
FROM
  course_instances
WHERE
  id = $course_instance_id;

-- BLOCK select_credit_pool_for_update
SELECT
  credit_transferable_milli_dollars,
  credit_non_transferable_milli_dollars,
  (
    credit_transferable_milli_dollars + credit_non_transferable_milli_dollars
  ) AS total_milli_dollars
FROM
  course_instances
WHERE
  id = $course_instance_id
FOR UPDATE;

-- BLOCK update_credit_balances
UPDATE course_instances
SET
  credit_transferable_milli_dollars = $credit_transferable_milli_dollars,
  credit_non_transferable_milli_dollars = $credit_non_transferable_milli_dollars
WHERE
  id = $course_instance_id;

-- BLOCK insert_credit_pool_change
INSERT INTO
  ai_grading_credit_pool_changes (
    course_instance_id,
    credit_before_milli_dollars,
    credit_after_milli_dollars,
    delta_milli_dollars,
    credit_type,
    reason,
    user_id,
    ai_grading_job_id,
    assessment_question_id
  )
VALUES
  (
    $course_instance_id,
    $credit_before_milli_dollars,
    $credit_after_milli_dollars,
    $delta_milli_dollars,
    $credit_type,
    $reason,
    $user_id,
    $ai_grading_job_id,
    $assessment_question_id
  )
RETURNING
  *;

-- BLOCK select_credit_pool_changes_batched
WITH
  last_change_per_sequence AS (
    SELECT DISTINCT
      ON (j2.job_sequence_id) j2.job_sequence_id,
      c2.credit_after_milli_dollars
    FROM
      ai_grading_credit_pool_changes AS c2
      JOIN ai_grading_jobs AS j2 ON j2.id = c2.ai_grading_job_id
    WHERE
      c2.course_instance_id = $course_instance_id
      AND j2.job_sequence_id IS NOT NULL
    ORDER BY
      j2.job_sequence_id ASC,
      c2.id DESC
  ),
  batched AS (
    SELECT
      MIN(c.id) AS id,
      j.job_sequence_id,
      MIN(c.created_at) AS created_at,
      SUM(c.delta_milli_dollars) AS delta_milli_dollars,
      lc.credit_after_milli_dollars,
      COUNT(DISTINCT c.ai_grading_job_id)::int AS submission_count,
      'AI grading' AS reason,
      MAX(u.name) AS user_name,
      MAX(u.uid) AS user_uid
    FROM
      ai_grading_credit_pool_changes AS c
      JOIN ai_grading_jobs AS j ON j.id = c.ai_grading_job_id
      JOIN last_change_per_sequence AS lc ON lc.job_sequence_id = j.job_sequence_id
      LEFT JOIN users AS u ON u.id = c.user_id
    WHERE
      c.course_instance_id = $course_instance_id
      AND c.ai_grading_job_id IS NOT NULL
      AND j.job_sequence_id IS NOT NULL
    GROUP BY
      j.job_sequence_id,
      lc.credit_after_milli_dollars
    UNION ALL
    SELECT
      c.id,
      NULL::bigint AS job_sequence_id,
      c.created_at,
      c.delta_milli_dollars,
      c.credit_after_milli_dollars,
      1 AS submission_count,
      'AI grading' AS reason,
      u.name AS user_name,
      u.uid AS user_uid
    FROM
      ai_grading_credit_pool_changes AS c
      JOIN ai_grading_jobs AS j ON j.id = c.ai_grading_job_id
      LEFT JOIN users AS u ON u.id = c.user_id
    WHERE
      c.course_instance_id = $course_instance_id
      AND c.ai_grading_job_id IS NOT NULL
      AND j.job_sequence_id IS NULL
    UNION ALL
    SELECT
      c.id,
      NULL::bigint AS job_sequence_id,
      c.created_at,
      c.delta_milli_dollars,
      c.credit_after_milli_dollars,
      1 AS submission_count,
      c.reason,
      u.name AS user_name,
      u.uid AS user_uid
    FROM
      ai_grading_credit_pool_changes AS c
      LEFT JOIN users AS u ON u.id = c.user_id
    WHERE
      c.course_instance_id = $course_instance_id
      AND c.ai_grading_job_id IS NULL
  )
SELECT
  *,
  COUNT(*) OVER () AS total_count
FROM
  batched
ORDER BY
  created_at DESC,
  id DESC
LIMIT
  $limit
OFFSET
  $offset;

-- BLOCK select_daily_spending
WITH
  daily_totals AS (
    SELECT
      c.created_at::date AS day,
      SUM(ABS(c.delta_milli_dollars)) AS total
    FROM
      ai_grading_credit_pool_changes AS c
    WHERE
      c.course_instance_id = $course_instance_id
      AND c.created_at >= $start_date::date
      AND c.created_at < ($end_date::date + '1 day'::interval)
      AND c.delta_milli_dollars < 0
      AND c.ai_grading_job_id IS NOT NULL
    GROUP BY
      c.created_at::date
  )
SELECT
  d::date AS date,
  COALESCE(daily_totals.total, 0)::bigint AS spending_milli_dollars
FROM
  generate_series(
    $start_date::date,
    $end_date::date,
    '1 day'::interval
  ) AS d
  LEFT JOIN daily_totals ON daily_totals.day = d::date
ORDER BY
  d ASC;

-- BLOCK select_daily_spending_grouped
SELECT
  DATE_TRUNC('day', c.created_at)::date AS date,
  CASE $group_by
    WHEN 'user' THEN COALESCE(u.name, u.uid, 'User ' || c.user_id::text)
    WHEN 'assessment' THEN COALESCE(
      a.title || E'\n' || a.tid,
      a.title,
      a.tid,
      'Unknown assessment'
    )
    WHEN 'question' THEN COALESCE(
      q.title || E'\n' || q.qid,
      q.title,
      q.qid,
      'Unknown question'
    )
  END AS group_label,
  SUM(ABS(c.delta_milli_dollars))::bigint AS spending_milli_dollars
FROM
  ai_grading_credit_pool_changes AS c
  LEFT JOIN users AS u ON u.id = c.user_id
  LEFT JOIN assessment_questions AS aq ON aq.id = c.assessment_question_id
  LEFT JOIN assessments AS a ON a.id = aq.assessment_id
  LEFT JOIN questions AS q ON q.id = aq.question_id
WHERE
  c.course_instance_id = $course_instance_id
  AND c.created_at >= $start_date
  AND c.created_at::date <= $end_date::date
  AND c.delta_milli_dollars < 0
  AND c.ai_grading_job_id IS NOT NULL
GROUP BY
  DATE_TRUNC('day', c.created_at)::date,
  group_label
ORDER BY
  date ASC,
  group_label ASC;
