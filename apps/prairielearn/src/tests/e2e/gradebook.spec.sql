-- BLOCK select_first_assessment
SELECT
  a.id,
  aset.abbreviation || a.number AS label
FROM
  assessments AS a
  JOIN assessment_sets AS aset ON aset.id = a.assessment_set_id
WHERE
  a.course_instance_id = $course_instance_id
ORDER BY
  a.id
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
  id;

-- BLOCK insert_enrollment
INSERT INTO
  enrollments (
    user_id,
    course_instance_id,
    status,
    first_joined_at
  )
VALUES
  ($user_id, $course_instance_id, 'joined', NOW())
ON CONFLICT DO NOTHING;

-- BLOCK insert_assessment_instance
INSERT INTO
  assessment_instances (
    assessment_id,
    user_id,
    number,
    score_perc,
    points,
    max_points
  )
VALUES
  (
    $assessment_id,
    $user_id,
    1,
    $score_perc,
    $score_perc,
    100
  )
ON CONFLICT DO NOTHING;
