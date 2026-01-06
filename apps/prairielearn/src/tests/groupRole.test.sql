-- BLOCK select_group_work_assessment_with_roles
SELECT
  a.id
FROM
  assessments AS a
  JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
  JOIN team_configs AS gc ON (gc.assessment_id = a.id)
WHERE
  a.course_instance_id = 1
  AND aset.abbreviation = 'HW'
  AND a.team_work IS TRUE
  AND gc.has_roles IS TRUE;

-- BLOCK select_group_work_assessment_without_roles
SELECT
  a.id,
  gc.has_roles
FROM
  assessments AS a
  JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
  JOIN team_configs AS gc ON (gc.assessment_id = a.id)
WHERE
  a.course_instance_id = 1
  AND aset.abbreviation = 'HW'
  AND a.team_work IS TRUE
  AND gc.has_roles IS FALSE;

-- BLOCK select_assessment_group_roles
SELECT
  *
FROM
  team_roles
WHERE
  assessment_id = $assessment_id;

-- BLOCK select_group_user_roles
SELECT
  gur.user_id,
  gur.team_role_id
FROM
  team_configs AS gc
  JOIN teams AS g ON g.team_config_id = gc.id
  JOIN team_user_roles AS gur ON gur.team_id = g.id
WHERE
  gc.assessment_id = $assessment_id
ORDER BY
  gur.user_id,
  gur.team_role_id;

-- BLOCK select_assessment
SELECT
  id
FROM
  assessments
WHERE
  tid = $tid
  AND deleted_at IS NULL;
