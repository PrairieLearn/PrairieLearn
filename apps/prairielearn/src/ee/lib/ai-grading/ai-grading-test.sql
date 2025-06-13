-- BLOCK select_rubric_id_from_grading
SELECT
  rubric_id
FROM
  rubric_gradings
WHERE
  id = $manual_rubric_grading_id
LIMIT
  1;

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
