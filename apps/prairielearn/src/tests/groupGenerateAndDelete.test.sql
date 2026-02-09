-- BLOCK select_group_work_assessment
SELECT
  a.id
FROM
  assessments AS a
  JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
WHERE
  a.course_instance_id = 1
  AND aset.abbreviation = 'HW'
  AND a.team_work IS TRUE;

-- BLOCK insert_group_assessment_instance
INSERT INTO
  assessment_instances (auth_user_id, assessment_id, team_id, number)
VALUES
  ($authn_user_id, $assessment_id, $team_id, 1)
RETURNING
  *;

-- BLOCK select_assessment_instance
SELECT
  *
FROM
  assessment_instances
WHERE
  id = $assessment_instance_id;
