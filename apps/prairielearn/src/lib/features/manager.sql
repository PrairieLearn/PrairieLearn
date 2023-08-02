-- BLOCK is_feature_enabled
SELECT
  EXISTS (
    SELECT
      1
    FROM
      feature_grants
    WHERE
      name = $name
      AND (
        institution_id IS NULL
        OR $institution_id = institution_id
      )
      AND (
        course_id IS NULL
        OR $course_id = course_id
      )
      AND (
        course_instance_id IS NULL
        OR $course_instance_id = course_instance_id
      )
      AND (
        user_id IS NULL
        OR $user_id = user_id
      )
  ) as exists;

-- BLOCK enable_feature
INSERT INTO
  feature_grants (
    name,
    institution_id,
    course_id,
    course_instance_id,
    user_id
  )
VALUES
  (
    $name,
    $institution_id,
    $course_id,
    $course_instance_id,
    $user_id
  )
ON CONFLICT DO NOTHING;

-- BLOCK disable_feature
DELETE FROM feature_grants
WHERE
  name = $name
  AND (
    institution_id IS NULL
    OR $institution_id = institution_id
  )
  AND (
    course_id IS NULL
    OR $course_id = course_id
  )
  AND (
    course_instance_id IS NULL
    OR $course_instance_id = course_instance_id
  )
  AND (
    user_id IS NULL
    OR $user_id = user_id
  );
