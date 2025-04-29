-- BLOCK select_assessment
SELECT
  to_jsonb(a.*) AS assessment,
  to_jsonb(ci.*) AS course_instance
FROM
  assessments AS a
  JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
WHERE
  a.id = $assessment_id
  AND a.deleted_at IS NULL
  AND a.course_instance_id = $course_instance_id
  AND ci.deleted_at IS NULL;
