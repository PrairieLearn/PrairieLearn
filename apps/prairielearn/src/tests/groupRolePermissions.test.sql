-- BLOCK select_assessment
SELECT
  id
FROM
  assessments
WHERE
  tid = $tid
  AND deleted_at IS NULL;

-- BLOCK generate_and_enroll_3_users
SELECT
  user_id,
  uid,
  name,
  uin
FROM
  users_randomly_generate (3, 1)
  LEFT JOIN course_instances AS ci on (ci.id = 1)
  LEFT JOIN pl_courses AS c ON (c.id = ci.course_id)
ORDER BY
  user_id;

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