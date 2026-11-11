-- BLOCK insert_print_form
INSERT INTO
  print_forms (assessment_id, user_id, authn_user_id, label)
VALUES
  ($assessment_id, $user_id, $authn_user_id, $label)
RETURNING
  *;

-- BLOCK lock_assessment_for_print_forms
SELECT
  id
FROM
  assessments
WHERE
  id = $assessment_id
  AND deleted_at IS NULL
FOR NO KEY UPDATE;

-- BLOCK select_latest_print_form_label
SELECT
  label
FROM
  print_forms
WHERE
  assessment_id = $assessment_id
ORDER BY
  id DESC
LIMIT
  1;

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
  AND a.deleted_at IS NULL
  AND ci.deleted_at IS NULL;

-- BLOCK select_print_forms_for_assessment
SELECT
  pf.*
FROM
  print_forms AS pf
  JOIN assessments AS a ON a.id = pf.assessment_id
  JOIN course_instances AS ci ON ci.id = a.course_instance_id
WHERE
  pf.assessment_id = $assessment_id
  AND a.deleted_at IS NULL
  AND ci.deleted_at IS NULL
ORDER BY
  pf.id DESC;

-- BLOCK select_active_print_forms_for_assessment
SELECT
  pf.*
FROM
  print_forms AS pf
  JOIN assessments AS a ON a.id = pf.assessment_id
  JOIN course_instances AS ci ON ci.id = a.course_instance_id
WHERE
  pf.assessment_id = $assessment_id
  AND pf.archived_at IS NULL
  AND a.deleted_at IS NULL
  AND ci.deleted_at IS NULL
ORDER BY
  pf.id DESC;

-- BLOCK archive_print_form
UPDATE print_forms
SET
  archived_at = CURRENT_TIMESTAMP
WHERE
  id = $print_form_id
  AND assessment_id = $assessment_id
  AND archived_at IS NULL
RETURNING
  *;
