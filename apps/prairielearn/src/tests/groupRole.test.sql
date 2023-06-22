-- BLOCK select_group_work_assessment_with_roles
SELECT
  a.id
FROM
  assessments AS a
  JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
  JOIN group_configs as gc ON (gc.assessment_id = a.id)
WHERE
  a.course_instance_id = 1
  AND aset.abbreviation = 'HW'
  AND a.group_work is TRUE
  AND gc.has_roles is TRUE;

-- BLOCK select_group_work_assessment_without_roles
SELECT
  a.id,
  gc.has_roles
FROM
  assessments AS a
  JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
  JOIN group_configs as gc ON (gc.assessment_id = a.id)
WHERE
  a.course_instance_id = 1
  AND aset.abbreviation = 'HW'
  AND a.group_work is TRUE
  AND gc.has_roles is FALSE;

-- BLOCK select_assessment_group_roles
SELECT
  gr.id,
  gr.role_name,
  gr.minimum,
  gr.maximum
FROM
  group_roles AS gr
WHERE
  gr.assessment_id = $assessment_id;

-- BLOCK select_group_user_roles
SELECT
  gur.user_id,
  gur.group_role_id
FROM
  group_user_roles AS gur
  JOIN groups AS gr ON gur.group_id = gr.id
  JOIN group_configs AS gc ON gc.id = gr.group_config_id
WHERE
  gc.assessment_id = $assessment_id;

-- BLOCK generate_and_enroll_5_users
SELECT
  user_id,
  uid,
  name,
  uin
FROM
  users_randomly_generate (5, 1)
  LEFT JOIN course_instances AS ci on (ci.id = 1)
  LEFT JOIN pl_courses AS c ON (c.id = ci.course_id)
ORDER BY
  user_id;

-- BLOCK select_assessment
SELECT
  id
FROM
  assessments
WHERE
  tid = $tid
  AND deleted_at IS NULL;
