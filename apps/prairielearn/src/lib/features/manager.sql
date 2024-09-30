-- BLOCK is_feature_enabled
WITH
  has_feature_grant AS (
    SELECT
      COALESCE(
        ARRAY_AGG(
          enabled
          ORDER BY
            institution_id NULLS FIRST,
            course_id NULLS FIRST,
            course_instance_id NULLS FIRST,
            user_id NULLS FIRST
        ),
        '{}'::boolean[]
      ) AS enabled
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
  ),
  course_dev_mode_features AS (
    SELECT
      c.options -> 'devModeFeatures' AS dev_mode_features
    FROM
      pl_courses AS c
    WHERE
      $course_id IS NOT NULL
      AND c.id = $course_id
  )
SELECT
  has_feature_grant.enabled AS enabled,
  course_dev_mode_features.dev_mode_features AS course_dev_mode_features
FROM
  has_feature_grant
  FULL JOIN course_dev_mode_features ON true;

-- BLOCK toggle_feature
INSERT INTO
  feature_grants (
    name,
    enabled,
    institution_id,
    course_id,
    course_instance_id,
    user_id
  )
VALUES
  (
    $name,
    $enabled,
    $institution_id,
    $course_id,
    $course_instance_id,
    $user_id
  )
ON CONFLICT (
  name,
  institution_id,
  course_id,
  course_instance_id,
  user_id
) DO
UPDATE
SET
  enabled = EXCLUDED.enabled;

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
