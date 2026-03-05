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

-- BLOCK select_credit_pool_changes
SELECT
  c.id,
  c.created_at,
  c.delta_milli_dollars,
  c.credit_before_milli_dollars,
  c.credit_after_milli_dollars,
  c.credit_type,
  c.reason,
  u.name AS user_name,
  u.uid AS user_uid
FROM
  ai_grading_credit_pool_changes AS c
  LEFT JOIN users AS u ON u.id = c.user_id
WHERE
  c.course_instance_id = $course_instance_id
ORDER BY
  c.created_at DESC,
  c.id DESC
LIMIT
  200;

-- BLOCK select_credit_pool_balance_time_series
SELECT
  c.created_at AS date,
  c.credit_after_milli_dollars AS balance_milli_dollars
FROM
  ai_grading_credit_pool_changes AS c
WHERE
  c.course_instance_id = $course_instance_id
ORDER BY
  c.created_at ASC,
  c.id ASC;
