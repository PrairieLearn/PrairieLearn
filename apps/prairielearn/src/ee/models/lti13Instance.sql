-- BLOCK select_lti13_instance
SELECT
  *
FROM
  lti13_instances
WHERE
  id = $lti13_instance_id
  AND deleted_at IS NULL;

-- BLOCK select_ci_validation
SELECT
  EXISTS (
    SELECT
      1
    FROM
      lti13_course_instances
    WHERE
      course_instance_id = $course_instance_id
      AND deleted_at IS NULL
  );

-- BLOCK get_instances_ci
SELECT
  li.*
FROM
  lti13_instances AS li
  JOIN lti13_course_instances AS lci ON lci.lti13_instance_id = li.id
WHERE
  lci.course_instance_id = $course_instance_id
  AND lci.deleted_at IS NULL
;
