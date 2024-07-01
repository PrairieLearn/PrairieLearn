-- BLOCK select_lti13_instances
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

-- BLOCK delete_lti13_course_instance
DELETE FROM lti13_course_instances AS lci
WHERE
  course_instance_id = $course_instance_id
  AND id = $lti13_course_instance_id
RETURNING
  *
