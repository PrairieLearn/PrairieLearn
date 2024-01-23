-- BLOCK select_group_work_assessment
SELECT
  a.id
FROM
  assessments AS a
  JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
WHERE
  a.course_instance_id = 1
  AND aset.abbreviation = 'HW'
  AND a.group_work is TRUE;

-- BLOCK generate_and_enroll_3_users
SELECT
  user_id,
  uid,
  name,
  uin
FROM
  users_randomly_generate (3, 1)
ORDER BY
  user_id;

-- BLOCK select_group_users
SELECT
  *
FROM
  group_configs AS gc
  LEFT JOIN groups AS g ON (g.group_config_id = gc.id)
  LEFT JOIN group_users AS gu ON (gu.group_id = g.id)
WHERE
  gc.assessment_id = $assessment_id
  AND gc.deleted_at IS NULL
  AND g.deleted_at IS NULL
  AND g.name = $group_name;

-- BLOCK select_all_assessment_instance
SELECT
  ai.*
FROM
  assessment_instances AS ai;

-- BLOCK select_variant
SELECT
  v.*
FROM
  variants AS v
WHERE
  v.id = $variant_id;

-- BLOCK select_last_submission_for_variants
SELECT
  s.*
FROM
  submissions AS s
  JOIN variants AS v ON (v.id = s.variant_id)
WHERE
  v.id = $variant_id
ORDER BY
  s.date DESC
LIMIT
  1;

-- BLOCK select_assessment_instance
SELECT
  ai.*
FROM
  assessment_instances AS ai
