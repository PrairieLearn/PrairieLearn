-- Add lti feature flags to any course instance that had LTI credentials configured
INSERT INTO
  feature_grants (
    name,
    institution_id,
    course_id,
    course_instance_id
  )
SELECT DISTINCT
  'lti11',
  c.institution_id,
  c.id,
  ci.id
FROM
  lti_credentials AS lc
  JOIN course_instances AS ci ON (ci.id = lc.course_instance_id)
  JOIN pl_courses AS c ON (c.id = ci.course_id)
WHERE
  lc.deleted_at IS NULL
  AND ci.deleted_at IS NULL
ON CONFLICT DO NOTHING;
