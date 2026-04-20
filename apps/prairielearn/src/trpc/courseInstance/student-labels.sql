-- BLOCK select_assessments_with_student_label
SELECT DISTINCT
  ci.short_name AS course_instance_directory,
  a.tid AS assessment_directory
FROM
  student_labels AS sl
  JOIN assessment_access_control_student_labels AS acsl ON (acsl.student_label_id = sl.id)
  JOIN assessment_access_control_rules AS aacr ON (aacr.id = acsl.assessment_access_control_rule_id)
  JOIN assessments AS a ON (a.id = aacr.assessment_id)
  JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
WHERE
  sl.course_instance_id = $course_instance_id
  AND sl.name = $label_name
  AND a.deleted_at IS NULL
  AND ci.deleted_at IS NULL;
