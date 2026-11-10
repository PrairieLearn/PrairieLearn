-- BLOCK insert_print_form
INSERT INTO
  print_forms (assessment_id, user_id, authn_user_id)
VALUES
  ($assessment_id, $user_id, $authn_user_id)
RETURNING
  *;

-- BLOCK select_optional_print_form
SELECT
  pf.*
FROM
  print_forms AS pf
  JOIN assessments AS a ON a.id = pf.assessment_id
  JOIN course_instances AS ci ON ci.id = a.course_instance_id
WHERE
  pf.id = $print_form_id
  AND pf.assessment_id = $assessment_id
  AND pf.user_id = $user_id
  AND a.deleted_at IS NULL
  AND ci.deleted_at IS NULL;

-- BLOCK select_print_forms_for_user
SELECT
  pf.*
FROM
  print_forms AS pf
  JOIN assessments AS a ON a.id = pf.assessment_id
  JOIN course_instances AS ci ON ci.id = a.course_instance_id
WHERE
  pf.assessment_id = $assessment_id
  AND pf.user_id = $user_id
  AND a.deleted_at IS NULL
  AND ci.deleted_at IS NULL
ORDER BY
  pf.id DESC;
