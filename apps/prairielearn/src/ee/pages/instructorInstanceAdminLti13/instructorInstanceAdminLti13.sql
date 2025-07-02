-- BLOCK select_combined_lti13_instances
SELECT
  to_jsonb(lci) AS lti13_course_instance,
  to_jsonb(li) AS lti13_instance
FROM
  lti13_course_instances AS lci
  JOIN lti13_instances li ON lci.lti13_instance_id = li.id
WHERE
  course_instance_id = $course_instance_id
  AND li.deleted_at IS NULL
ORDER BY
  lci.id DESC;

-- BLOCK select_lti13_instances
SELECT
  *
FROM
  lti13_instances AS li
WHERE
  institution_id = $institution_id
  AND deleted_at IS NULL;
