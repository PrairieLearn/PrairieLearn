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

-- BLOCK deduct_credits
-- Deducts from non_transferable first, then transferable.
-- Returns zero rows if insufficient credits.
UPDATE course_instances
SET
  credit_non_transferable_milli_dollars = GREATEST(
    0,
    credit_non_transferable_milli_dollars - $cost_milli_dollars
  ),
  credit_transferable_milli_dollars = GREATEST(
    0,
    credit_transferable_milli_dollars - GREATEST(
      0,
      $cost_milli_dollars - credit_non_transferable_milli_dollars
    )
  )
WHERE
  id = $course_instance_id
  AND (
    credit_transferable_milli_dollars + credit_non_transferable_milli_dollars
  ) >= $cost_milli_dollars
RETURNING
  credit_transferable_milli_dollars,
  credit_non_transferable_milli_dollars;

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

-- BLOCK update_credit_transferable
UPDATE course_instances
SET
  credit_transferable_milli_dollars = $credit_transferable_milli_dollars
WHERE
  id = $course_instance_id
RETURNING
  credit_transferable_milli_dollars,
  credit_non_transferable_milli_dollars;

-- BLOCK update_credit_non_transferable
UPDATE course_instances
SET
  credit_non_transferable_milli_dollars = $credit_non_transferable_milli_dollars
WHERE
  id = $course_instance_id
RETURNING
  credit_transferable_milli_dollars,
  credit_non_transferable_milli_dollars;

-- BLOCK select_credit_pool_changes_batched
WITH
  batched AS (
    SELECT
      MIN(c.id) AS id,
      j.job_sequence_id,
      MIN(c.created_at) AS created_at,
      SUM(c.delta_milli_dollars) AS delta_milli_dollars,
      (
        SELECT
          c2.credit_after_milli_dollars
        FROM
          ai_grading_credit_pool_changes AS c2
          JOIN ai_grading_jobs AS j2 ON j2.id = c2.ai_grading_job_id
        WHERE
          j2.job_sequence_id = j.job_sequence_id
          AND c2.course_instance_id = $course_instance_id
        ORDER BY
          c2.id DESC
        LIMIT
          1
      ) AS credit_after_milli_dollars,
      COUNT(*)::int AS submission_count,
      'AI grading' AS reason,
      MAX(u.name) AS user_name,
      MAX(u.uid) AS user_uid
    FROM
      ai_grading_credit_pool_changes AS c
      JOIN ai_grading_jobs AS j ON j.id = c.ai_grading_job_id
      LEFT JOIN users AS u ON u.id = c.user_id
    WHERE
      c.course_instance_id = $course_instance_id
      AND c.ai_grading_job_id IS NOT NULL
    GROUP BY
      j.job_sequence_id
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
  date_range AS (
    SELECT
      generate_series(
        DATE_TRUNC('day', NOW() - ($days || ' days')::interval),
        DATE_TRUNC('day', NOW()),
        '1 day'::interval
      )::date AS day
  ),
  daily AS (
    SELECT
      DATE_TRUNC('day', created_at)::date AS day,
      SUM(ABS(delta_milli_dollars)) AS spending_milli_dollars
    FROM
      ai_grading_credit_pool_changes
    WHERE
      course_instance_id = $course_instance_id
      AND created_at >= NOW() - ($days || ' days')::interval
      AND delta_milli_dollars < 0
    GROUP BY
      DATE_TRUNC('day', created_at)::date
  )
SELECT
  dr.day AS date,
  COALESCE(d.spending_milli_dollars, 0)::bigint AS spending_milli_dollars
FROM
  date_range AS dr
  LEFT JOIN daily AS d ON d.day = dr.day
ORDER BY
  dr.day ASC;
