-- BLOCK select_lti13_instances
SELECT
  to_jsonb(lci) AS lti13_course_instance,
  to_jsonb(li) AS lti13_instance
FROM
  lti13_course_instances AS lci
  JOIN lti13_instances li ON lci.lti13_instance_id = li.id
WHERE
  course_instance_id = $course_instance_id
  AND lci.deleted_at IS NULL
  AND li.deleted_at IS NULL
ORDER BY
  lci.id DESC;

-- BLOCK delete_lti13_course_instance
UPDATE lti13_course_instances
SET
  deleted_at = NOW()
WHERE
  course_instance_id = $course_instance_id
  AND id = $lti13_course_instance_id
  AND deleted_at IS NULL;
