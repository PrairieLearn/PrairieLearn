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

-- BLOCK select_group_config
SELECT
  minimum,
  maximum
FROM
  group_configs
WHERE
  assessment_id = $assessment_id
  AND deleted_at IS NULL;

-- BLOCK select_student_user
SELECT
  count(*) as result
FROM
  users AS u;

-- BLOCK generate_and_enroll_5_users
SELECT
  user_id,
  uid,
  name,
  uin
FROM
  users_randomly_generate (5, 1)
ORDER BY
  user_id;

-- BLOCK select_all_user_in_group
SELECT
  group_id,
  user_id
FROM
  group_users;

-- BLOCK select_all_assessment_instance
SELECT
  ai.*
FROM
  assessment_instances AS ai;
