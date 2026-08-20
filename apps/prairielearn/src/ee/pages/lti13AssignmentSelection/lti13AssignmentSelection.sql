-- BLOCK select_lti13_course_instance
SELECT
  lci.*
FROM
  lti13_course_instances AS lci
WHERE
  lti13_instance_id = $lti13_instance_id
  AND deployment_id = $deployment_id
  AND context_id = $context_id;
