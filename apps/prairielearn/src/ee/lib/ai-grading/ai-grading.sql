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
