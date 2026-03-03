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
  c.*,
  u.name AS user_name,
  u.uid AS user_uid
FROM
  ai_grading_credit_pool_changes AS c
  LEFT JOIN users AS u ON u.id = c.user_id
WHERE
  c.course_instance_id = $course_instance_id
ORDER BY
  c.created_at DESC;

-- BLOCK select_credit_pool_balance_time_series
SELECT DISTINCT
  ON (date_trunc('day', c.created_at)) date_trunc('day', c.created_at) AS date,
  c.credit_after_milli_dollars AS balance_milli_dollars
FROM
  ai_grading_credit_pool_changes AS c
WHERE
  c.course_instance_id = $course_instance_id
ORDER BY
  date_trunc('day', c.created_at),
  c.created_at DESC;

-- BLOCK select_per_user_spend
SELECT
  u.id AS user_id,
  u.name AS user_name,
  u.uid,
  SUM(ABS(c.delta_milli_dollars))::bigint AS total_cost_milli_dollars
FROM
  ai_grading_credit_pool_changes AS c
  JOIN users AS u ON u.id = c.user_id
WHERE
  c.course_instance_id = $course_instance_id
  AND c.delta_milli_dollars < 0
GROUP BY
  u.id,
  u.name,
  u.uid
ORDER BY
  total_cost_milli_dollars DESC;

-- BLOCK select_per_assessment_spend
SELECT
  a.id AS assessment_id,
  aset.abbreviation || a.number || ': ' || a.title AS assessment_label,
  SUM(ABS(c.delta_milli_dollars))::bigint AS total_cost_milli_dollars
FROM
  ai_grading_credit_pool_changes AS c
  JOIN assessment_questions AS aq ON aq.id = c.assessment_question_id
  JOIN assessments AS a ON a.id = aq.assessment_id
  JOIN assessment_sets AS aset ON aset.id = a.assessment_set_id
WHERE
  c.course_instance_id = $course_instance_id
  AND c.delta_milli_dollars < 0
GROUP BY
  a.id,
  aset.abbreviation,
  a.number,
  a.title
ORDER BY
  total_cost_milli_dollars DESC;

-- BLOCK select_per_question_spend
SELECT
  q.id AS question_id,
  q.qid AS question_qid,
  q.title AS question_title,
  SUM(ABS(c.delta_milli_dollars))::bigint AS total_cost_milli_dollars
FROM
  ai_grading_credit_pool_changes AS c
  JOIN assessment_questions AS aq ON aq.id = c.assessment_question_id
  JOIN questions AS q ON q.id = aq.question_id
WHERE
  c.course_instance_id = $course_instance_id
  AND c.delta_milli_dollars < 0
GROUP BY
  q.id,
  q.qid,
  q.title
ORDER BY
  total_cost_milli_dollars DESC;

-- BLOCK select_enrollment_count
SELECT
  COUNT(e.user_id)::integer AS enrollment_count
FROM
  enrollments AS e
WHERE
  e.course_instance_id = $course_instance_id
  AND NOT users_is_instructor_in_course_instance (e.user_id, e.course_instance_id);
