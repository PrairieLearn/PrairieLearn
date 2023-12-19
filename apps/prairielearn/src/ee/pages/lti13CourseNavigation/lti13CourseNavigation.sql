-- BLOCK get_course_instance
SELECT
  lci.*
FROM
  lti13_course_instances AS lci
WHERE
  lti13_instance_id = $lti13_instance_id
  AND deployment_id = $deployment_id
  AND context_id = $context_id
  AND deleted_at IS NULL;

-- BLOCK insert_lci
INSERT INTO
  lti13_course_instances (
    lti13_instance_id,
    deployment_id,
    context_id,
    context_label,
    context_title,
    course_instance_id
  )
VALUES
  (
    $lti13_instance_id,
    $deployment_id,
    $context_id,
    $context_label,
    $context_title,
    $course_instance_id
  );

-- BLOCK upsert_lci
UPDATE lti13_course_instances
SET
  (context_label, context_title) = ($context_label, $context_title)
WHERE
  lti13_instance_id = $lti13_instance_id
  AND deployment_id = $deployment_id
  AND context_id = $context_id
  AND deleted_at IS NULL;
