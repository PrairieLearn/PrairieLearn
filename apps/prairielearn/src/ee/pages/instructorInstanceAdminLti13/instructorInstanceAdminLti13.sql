-- BLOCK get_lci
SELECT
  *
FROM
  lti13_course_instances
WHERE
  course_instance_id = $course_instance_id
  AND lti13_instance_id = $lti13_instance_id
  AND deleted_at IS NULL
;

-- BLOCK remove_connection
UPDATE lti13_course_instances SET deleted_at = NOW()
WHERE course_instance_id = $course_instance_id
AND lti13_instance_id = $lti13_instance_id
AND deleted_at IS NULL
;
