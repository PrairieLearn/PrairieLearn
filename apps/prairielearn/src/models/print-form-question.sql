-- BLOCK insert_print_form_questions
INSERT INTO
  print_form_questions (
    print_form_id,
    assessment_question_id,
    variant_id,
    position,
    question_number,
    max_points
  )
SELECT
  $print_form_id,
  q.assessment_question_id,
  q.variant_id,
  q.position,
  q.question_number,
  q.max_points
FROM
  jsonb_to_recordset($questions::jsonb) AS q (
    assessment_question_id BIGINT,
    variant_id BIGINT,
    position INTEGER,
    question_number TEXT,
    max_points DOUBLE PRECISION
  )
RETURNING
  *;

-- BLOCK update_print_form_question_variants
UPDATE print_form_questions AS pfq
SET
  variant_id = updates.variant_id
FROM
  jsonb_to_recordset($updates::jsonb) AS updates (
    id BIGINT,
    previous_variant_id BIGINT,
    variant_id BIGINT
  )
WHERE
  pfq.print_form_id = $print_form_id
  AND pfq.id = updates.id
  AND pfq.variant_id = updates.previous_variant_id
RETURNING
  pfq.*;

-- BLOCK select_print_form_questions
-- A saved form retains questions removed from the current assessment.
SELECT
  to_jsonb(pfq.*) AS print_form_question,
  to_jsonb(aq.*) AS assessment_question,
  to_jsonb(q.*) AS question
FROM
  print_form_questions AS pfq
  JOIN assessment_questions AS aq ON aq.id = pfq.assessment_question_id
  JOIN questions AS q ON q.id = aq.question_id
WHERE
  pfq.print_form_id = $print_form_id
ORDER BY
  pfq.position;

-- BLOCK select_optional_print_form_question
SELECT
  to_jsonb(pfq.*) AS print_form_question,
  to_jsonb(aq.*) AS assessment_question,
  to_jsonb(q.*) AS question
FROM
  print_form_questions AS pfq
  JOIN assessment_questions AS aq ON aq.id = pfq.assessment_question_id
  JOIN questions AS q ON q.id = aq.question_id
WHERE
  pfq.print_form_id = $print_form_id
  AND pfq.id = $print_form_question_id;

-- BLOCK select_print_form_question_viability
SELECT
  pfq.print_form_id,
  pfq.question_number,
  q.type = 'Freeform' AS supported,
  v.broken_at IS NOT NULL AS broken
FROM
  print_form_questions AS pfq
  JOIN assessment_questions AS aq ON aq.id = pfq.assessment_question_id
  JOIN questions AS q ON q.id = aq.question_id
  JOIN variants AS v ON v.id = pfq.variant_id
WHERE
  pfq.print_form_id = ANY ($print_form_ids::bigint[])
ORDER BY
  pfq.print_form_id,
  pfq.position;
