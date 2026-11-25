-- BLOCK select_instance_question
SELECT
  iq.id
FROM
  instance_questions AS iq
  JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
  JOIN questions AS q ON (q.id = aq.question_id)
WHERE
  iq.assessment_instance_id = $assessment_instance_id
  AND q.qid = 'addNumbers';

-- BLOCK set_question_grading_method
UPDATE questions
SET
  grading_method = $grading_method
WHERE
  id = $question_id;

-- BLOCK mark_external_job_submitted
UPDATE grading_jobs
SET
  grading_submitted_at = CURRENT_TIMESTAMP
WHERE
  id = $grading_job_id;

-- BLOCK select_external_grading_duration
SELECT
  coalesce(
    sum(
      extract(
        EPOCH
        FROM
          duration
      )
    ),
    0
  )::double precision
FROM
  course_instance_usages
WHERE
  course_instance_id = $course_instance_id
  AND type = 'External grading';

-- BLOCK select_variant
SELECT
  *
FROM
  variants
WHERE
  id = $variant_id;

-- BLOCK select_draft_id
SELECT
  id
FROM
  unsaved_submissions
WHERE
  instance_question_id = $instance_question_id
  AND user_id = $user_id;

-- BLOCK select_latest_submission
SELECT
  *
FROM
  submissions
WHERE
  variant_id = $variant_id
ORDER BY
  id DESC
LIMIT
  1;

-- BLOCK set_open
WITH
  updated_variant AS (
    UPDATE variants
    SET
      open = $open
    WHERE
      id = $variant_id
    RETURNING
      instance_question_id
  ),
  updated_question AS (
    UPDATE instance_questions AS iq
    SET
      open = $open
    FROM
      updated_variant AS v
    WHERE
      iq.id = v.instance_question_id
    RETURNING
      iq.assessment_instance_id
  )
UPDATE assessment_instances AS ai
SET
  open = $open
FROM
  updated_question AS iq
WHERE
  ai.id = iq.assessment_instance_id;

-- BLOCK select_open
SELECT
  ai.open AS assessment_open,
  iq.open AS question_open,
  v.open AS variant_open
FROM
  variants AS v
  JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
  JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
WHERE
  v.id = $variant_id;

-- BLOCK count_waiting_assessment_locks
SELECT
  count(*)::integer
FROM
  pg_stat_activity
WHERE
  datname = current_database()
  AND wait_event_type = 'Lock'
  AND query LIKE $query_pattern;

-- BLOCK select_question_auto_points
SELECT
  auto_points
FROM
  instance_questions
WHERE
  id = $instance_question_id;

-- BLOCK select_recovery_grading_counts
SELECT
  count(gj.id)::integer AS grading_job_count,
  min(gj.auth_user_id) AS auth_user_id,
  iq.number_attempts
FROM
  submissions AS s
  JOIN grading_jobs AS gj ON (gj.submission_id = s.id)
  JOIN variants AS v ON (v.id = s.variant_id)
  JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
WHERE
  s.id = $submission_id
GROUP BY
  iq.id;

-- BLOCK close_variant
UPDATE variants
SET
  open = FALSE
WHERE
  id = $variant_id;

-- BLOCK select_grading_issue_author
SELECT
  user_id,
  authn_user_id
FROM
  issues
WHERE
  variant_id = $variant_id
  AND instructor_message = $instructor_message;

-- BLOCK select_recovery_retry_state
SELECT
  count(gj.id)::integer AS grading_job_count,
  iq.status AS question_status
FROM
  submissions AS s
  JOIN variants AS v ON (v.id = s.variant_id)
  JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
  LEFT JOIN grading_jobs AS gj ON (gj.submission_id = s.id)
WHERE
  s.id = $submission_id
GROUP BY
  iq.id;
