-- BLOCK select_resumable_ai_grading_job_sequences
-- AI grading jobs the page should render an alert for on initial load. Only
-- still-active states (Running or Stopping) — terminal Stopped jobs match the
-- existing complete/failed behavior and are not resumed across page reloads.
SELECT
  id
FROM
  job_sequences
WHERE
  assessment_question_id = $assessment_question_id
  AND type = 'ai_grading'
  AND status IN ('Running', 'Stopping');

-- BLOCK count_running_ai_grading_jobs_for_course_instance
SELECT
  COUNT(*)::integer
FROM
  job_sequences
WHERE
  course_instance_id = $course_instance_id
  AND type = 'ai_grading'
  AND status IN ('Running', 'Stopping');

-- BLOCK request_stop_ai_grading_job
UPDATE job_sequences
SET
  status = 'Stopping',
  stop_requested_at = CURRENT_TIMESTAMP,
  stop_requested_by_user_id = $authn_user_id
WHERE
  id = $job_sequence_id
  AND assessment_question_id = $assessment_question_id
  AND type = 'ai_grading'
  AND status = 'Running'
RETURNING
  id;

-- BLOCK select_stop_requested
SELECT
  stop_requested_at IS NOT NULL
FROM
  job_sequences
WHERE
  id = $job_sequence_id;

-- BLOCK finalize_stopped_job_sequence
UPDATE job_sequences
SET
  status = 'Stopped',
  finish_date = CURRENT_TIMESTAMP
WHERE
  id = $job_sequence_id
  AND status = 'Stopping';

-- BLOCK ai_grading_concurrency_advisory_lock
-- Serializes the concurrent-job admission check + insert per course instance,
-- preventing two requests from both reading a count below the limit and then
-- both creating new ai_grading job sequences. Uses namespace 2 to avoid
-- collisions with the namespace-1 course advisory lock in server-jobs.sql.
SELECT
  pg_advisory_xact_lock(2, $course_instance_id::integer);

-- BLOCK insert_grading_job
INSERT INTO
  grading_jobs (
    submission_id,
    auth_user_id,
    graded_by,
    graded_at,
    grading_method,
    correct,
    score,
    auto_points,
    manual_points,
    feedback,
    manual_rubric_grading_id
  )
VALUES
  (
    $submission_id,
    $authn_user_id,
    $authn_user_id,
    now(),
    $grading_method,
    $correct,
    $score,
    $auto_points,
    $manual_points,
    $feedback,
    $manual_rubric_grading_id
  )
RETURNING
  id;
