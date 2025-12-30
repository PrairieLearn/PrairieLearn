-- BLOCK select_team_work_assessment_with_roles
SELECT
  a.id
FROM
  assessments AS a
  JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
  JOIN team_configs AS tc ON (gc.assessment_id = a.id)
WHERE
  a.course_instance_id = 1
  AND aset.abbreviation = 'HW'
  AND a.team_work IS TRUE
  AND tc.has_roles IS TRUE;

-- BLOCK select_team_work_assessment_without_roles
SELECT
  a.id,
  tc.has_roles
FROM
  assessments AS a
  JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
  JOIN team_configs AS tc ON (gc.assessment_id = a.id)
WHERE
  a.course_instance_id = 1
  AND aset.abbreviation = 'HW'
  AND a.team_work IS TRUE
  AND tc.has_roles IS FALSE;

-- BLOCK select_assessment_team_roles
SELECT
  *
FROM
  team_roles
WHERE
  assessment_id = $assessment_id;

-- BLOCK select_team_user_roles
SELECT
  tur.user_id,
  tur.team_role_id
FROM
  team_configs AS tc
  JOIN teams AS t ON t.team_config_id = tc.id
  JOIN team_user_roles AS tur ON tur.team_id = t.id
WHERE
  tc.assessment_id = $assessment_id
ORDER BY
  tur.user_id,
  tur.team_role_id;

-- BLOCK select_assessment
SELECT
  id
FROM
  assessments
WHERE
  tid = $tid
  AND deleted_at IS NULL;
