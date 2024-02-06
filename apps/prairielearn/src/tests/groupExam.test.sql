-- BLOCK select_group_exam_by_tid
SELECT
  a.id
FROM
  assessments AS a
  JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
WHERE
  a.tid = $assessment_tid;

-- BLOCK select_group_config
SELECT
  minimum,
  maximum
FROM
  group_configs
WHERE
  assessment_id = $assessment_id
  AND deleted_at IS NULL;

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

-- BLOCK select_all_assessment_instance
SELECT
  ai.*
FROM
  assessment_instances AS ai;
