-- BLOCK get_course_instance
SELECT
  lci.*
FROM
  lti13_course_instances AS lci
WHERE
  lti13_instance_id = $lti13_instance_id
  AND deployment_id = $deployment_id
  AND context_id = $context_id
  AND deleted_at IS NULL
;

-- BLOCK link_ci
INSERT INTO
  pl_lti13_course_instances (
    pl_lti13_instance_id,
    deployment_id,
    context_id,
    context_label,
    context_title,
    course_instance_id,
    nrps_context_memberships_url,
    ags_lineitems,
    ags_lineitem
  )
VALUES
  (
    $instance_id,
    $deployment_id,
    $context_id,
    $context_label,
    $context_title,
    $course_instance_id,
    $nrps_context_memberships_url,
    $ags_lineitems,
    $ags_lineitem
  );

-- upsert?
-- user who created?

-- BLOCK get_course
SELECT * FROM course_instances WHERE id = $course_instance_id;
