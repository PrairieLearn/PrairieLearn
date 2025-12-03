-- BLOCK select_first_assessment
SELECT
  id
FROM
  assessments
WHERE
  course_instance_id = 1
ORDER BY
  id
LIMIT
  1;

-- BLOCK insert_or_update_user
INSERT INTO
  users (uid, name, uin)
VALUES
  ($uid, $name, $uid)
ON CONFLICT (uid) DO UPDATE
SET
  name = EXCLUDED.name
RETURNING
  user_id;

-- BLOCK insert_enrollment
INSERT INTO
  enrollments (user_id, course_instance_id, status, first_joined_at)
VALUES
  ($user_id, 1, 'joined', NOW())
ON CONFLICT DO NOTHING;

-- BLOCK insert_assessment_instance
INSERT INTO
  assessment_instances (
    assessment_id,
    user_id,
    score_perc,
    points,
    max_points
  )
VALUES
  ($assessment_id, $user_id, $score_perc, $score_perc, 100);
