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

-- BLOCK select_uid_for_instance_question
SELECT
  u.uid as uid
FROM 
  instance_questions as iq
  JOIN assessment_instances as ai ON ai.id = iq.assessment_instance_id
  JOIN users as u ON u.user_id = ai.user_id
WHERE
  iq.id = $instance_question_id;