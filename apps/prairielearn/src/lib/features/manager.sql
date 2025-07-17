-- BLOCK is_feature_enabled
SELECT
  enabled
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
ORDER BY
  -- This ordering occurs that feature flag precedence works correctly.
  institution_id NULLS LAST,
  course_id NULLS LAST,
  course_instance_id NULLS LAST,
  user_id NULLS LAST
LIMIT
  1;

-- BLOCK update_feature_grant_enabled
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
) DO UPDATE
SET
  enabled = EXCLUDED.enabled;

-- BLOCK delete_feature
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
