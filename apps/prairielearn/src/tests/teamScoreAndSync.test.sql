-- BLOCK select_team_work_assessment
SELECT
  a.id
FROM
  assessments AS a
  JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
WHERE
  a.course_instance_id = 1
  AND aset.abbreviation = 'HW'
  AND a.team_work IS TRUE;

-- BLOCK select_team_users
SELECT
  *
FROM
  team_configs AS tc
  LEFT JOIN teams AS t ON (t.team_config_id = tc.id)
  LEFT JOIN team_users AS tu ON (tu.team_id = t.id)
WHERE
  tc.assessment_id = $assessment_id
  AND tc.deleted_at IS NULL
  AND t.deleted_at IS NULL
  AND t.name = $team_name;

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
