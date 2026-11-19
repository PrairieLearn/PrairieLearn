-- BLOCK insert_print_form
INSERT INTO
  print_forms (
    assessment_id,
    user_id,
    authn_user_id,
    label,
    settings
  )
VALUES
  (
    $assessment_id,
    $user_id,
    $authn_user_id,
    $label,
    $settings::jsonb
  )
RETURNING
  *;

-- BLOCK update_print_form_settings
UPDATE print_forms
SET
  settings = $settings::jsonb
WHERE
  id = $print_form_id
  AND assessment_id = $assessment_id
  AND archived_at IS NULL
RETURNING
  *;

-- BLOCK lock_print_form_question_selections
UPDATE print_forms
SET
  question_selection_locked_at = COALESCE(question_selection_locked_at, CURRENT_TIMESTAMP)
WHERE
  assessment_id = $assessment_id
  AND id = ANY ($print_form_ids::bigint[]);

-- BLOCK update_print_form_paper_size
UPDATE print_forms
SET
  settings = jsonb_set(
    settings,
    '{paperSize}',
    to_jsonb($paper_size::text)
  )
WHERE
  id = $print_form_id
  AND assessment_id = $assessment_id
  AND archived_at IS NULL
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

-- BLOCK select_randomizable_print_form_ids
SELECT DISTINCT
  pfq.print_form_id
FROM
  print_forms AS pf
  JOIN print_form_questions AS pfq ON pfq.print_form_id = pf.id
  JOIN assessment_questions AS aq ON aq.id = pfq.assessment_question_id
  JOIN questions AS q ON q.id = aq.question_id
WHERE
  pf.assessment_id = $assessment_id
  AND pf.archived_at IS NULL
  AND q.single_variant IS DISTINCT FROM TRUE;

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
