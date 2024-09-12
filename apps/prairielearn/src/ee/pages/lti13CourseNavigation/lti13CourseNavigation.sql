-- BLOCK select_lti13_course_instance
SELECT
  lci.*
FROM
  lti13_course_instances AS lci
WHERE
  lti13_instance_id = $lti13_instance_id
  AND deployment_id = $deployment_id
  AND context_id = $context_id;

-- BLOCK select_lti13_course_instance_institution
SELECT
  i.id
FROM
  lti13_instances
  JOIN institutions AS i ON i.id = lti13_instances.institution_id
  JOIN pl_courses AS plc ON plc.institution_id = i.id
  JOIN course_instances AS ci ON (
    plc.id = ci.course_id
    AND ci.id = $course_instance_id
  )
WHERE
  lti13_instances.id = $lti13_instance_id
  AND lti13_instances.id = $authn_lti13_instance_id;

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

-- BLOCK update_lti13_course_instance
UPDATE lti13_course_instances
SET
  context_label = $context_label,
  context_title = $context_title,
  lineitems_url = $lineitems_url,
  context_memberships_url = $context_memberships_url
WHERE
  lti13_instance_id = $lti13_instance_id
  AND course_instance_id = $course_instance_id
  AND deployment_id = $deployment_id
  AND context_id = $context_id;
