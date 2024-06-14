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
WITH
  old_row AS (
    DELETE FROM lti13_course_instances AS lci
    WHERE
      course_instance_id = $course_instance_id
      AND id = $lti13_course_instance_id
    RETURNING
      lci.*
  )
INSERT INTO
  audit_logs (
    authn_user_id,
    table_name,
    course_instance_id,
    row_id,
    action,
    old_state
  )
SELECT
  $authn_user_id,
  'lti13_course_instances',
  old_row.course_instance_id,
  old_row.id,
  'delete',
  to_jsonb(old_row)
FROM
  old_row;
