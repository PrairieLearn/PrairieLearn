-- BLOCK is_feature_enabled
WITH
  has_feature_grant AS (
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
      ) AS exists
  ),
  has_dev_mode_feature AS (
    SELECT
      COALESCE(c.options ->> 'devModeFeatures', '[]')::jsonb ? $name AS exists
    FROM
      pl_courses AS c
    WHERE
      c.id = $course_id
  )
SELECT
  COALESCE(has_feature_grant.exists, false) AS has_feature_grant,
  COALESCE(has_dev_mode_feature.exists, false) AS has_dev_mode_feature
FROM
  has_feature_grant
  FULL JOIN has_dev_mode_feature ON true;

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
