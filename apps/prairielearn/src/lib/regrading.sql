-- BLOCK select_regrade_assessment_instance_info
SELECT
  assessment_instance_label (ai, a, aset),
  a.id AS assessment_id,
  u.uid AS user_uid,
  g.id AS group_id,
  g.name AS group_name,
  ci.id AS course_instance_id,
  c.id AS course_id
FROM
  assessment_instances AS ai
  JOIN assessments AS a ON (a.id = ai.assessment_id)
  JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
  JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
  JOIN pl_courses AS c ON (c.id = ci.course_id)
  LEFT JOIN users AS u ON (u.user_id = ai.user_id)
  LEFT JOIN groups AS g ON (g.id = ai.group_id)
WHERE
  ai.id = $assessment_instance_id
  AND g.deleted_at IS NULL;

-- BLOCK select_regrade_assessment_info
SELECT
  assessment_label (a, aset),
  ci.id AS course_instance_id,
  c.id AS course_id
FROM
  assessments AS a
  JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
  JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
  JOIN pl_courses AS c ON (c.id = ci.course_id)
WHERE
  a.id = $assessment_id;

-- BLOCK select_regrade_assessment_instances
SELECT
  ai.id AS assessment_instance_id,
  assessment_instance_label (ai, a, aset),
  u.uid AS user_uid
FROM
  assessments AS a
  JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
  JOIN assessment_instances AS ai ON (ai.assessment_id = a.id)
  JOIN users AS u ON (u.user_id = ai.user_id)
WHERE
  a.id = $assessment_id
ORDER BY
  u.uid,
  u.user_id,
  ai.number;
