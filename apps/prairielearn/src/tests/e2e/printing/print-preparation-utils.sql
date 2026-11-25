-- BLOCK clear_print_exports
DELETE FROM print_exports AS pe USING assessments AS a
WHERE
  pe.assessment_id = a.id
  AND a.course_instance_id = $course_instance_id;

-- BLOCK clear_print_forms
DELETE FROM print_forms AS pf USING assessments AS a
WHERE
  pf.assessment_id = a.id
  AND a.course_instance_id = $course_instance_id;
