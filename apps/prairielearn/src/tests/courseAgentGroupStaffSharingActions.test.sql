-- BLOCK select_group_uids
SELECT
  u.uid
FROM
  assessments AS a
  JOIN team_configs AS gc ON (gc.assessment_id = a.id)
  JOIN teams AS g ON (g.team_config_id = gc.id)
  JOIN team_users AS gu ON (gu.team_id = g.id)
  JOIN users AS u ON (u.id = gu.user_id)
WHERE
  a.course_instance_id = 1
  AND a.tid = $tid
  AND gc.deleted_at IS NULL
  AND g.deleted_at IS NULL
  AND g.name = $name
ORDER BY
  u.uid;

-- BLOCK select_group_id
SELECT
  g.id
FROM
  assessments AS a
  JOIN team_configs AS gc ON (gc.assessment_id = a.id)
  JOIN teams AS g ON (g.team_config_id = gc.id)
WHERE
  a.course_instance_id = 1
  AND a.tid = $tid
  AND gc.deleted_at IS NULL
  AND g.deleted_at IS NULL
  AND g.name = $name;

-- BLOCK insert_sharing_set
INSERT INTO
  sharing_sets (course_id, name, description)
VALUES
  ($course_id, $name, 'Questions for tests')
RETURNING
  id;
