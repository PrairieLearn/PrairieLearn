-- BLOCK select_assessment_by_id
SELECT
  *
FROM
  assessments
WHERE
  id = $id;

-- BLOCK insert_dummy_instance
INSERT INTO
  assessment_instances (
    assessment_id,
    user_id,
    auth_user_id,
    number,
    max_points,
    points,
    score_perc,
    open
  )
VALUES
  (
    $assessment_id,
    $user_id,
    $user_id,
    1,
    100,
    0,
    0,
    true
  );

-- BLOCK delete_dummy_instances
DELETE FROM assessment_instances
WHERE
  assessment_id = $assessment_id;
