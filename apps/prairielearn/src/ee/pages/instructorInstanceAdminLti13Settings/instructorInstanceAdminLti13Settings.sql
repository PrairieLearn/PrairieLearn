-- BLOCK delete_lti13_course_instance
DELETE FROM lti13_course_instances AS lci
WHERE
  course_instance_id = $course_instance_id
  AND id = $lti13_course_instance_id;
