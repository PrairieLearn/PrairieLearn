-- BLOCK set_multiple_instance
UPDATE assessments
SET
  multiple_instance = $multiple_instance
WHERE
  id = $assessment_id;

-- BLOCK set_static_assessment
WITH
  updated_assessment AS (
    UPDATE assessments
    SET
      shuffle_questions = FALSE
    WHERE
      id = $assessment_id
  )
UPDATE questions AS q
SET
  single_variant = TRUE
FROM
  assessment_questions AS aq
WHERE
  aq.question_id = q.id
  AND aq.assessment_id = $assessment_id;

-- BLOCK enable_shuffle
UPDATE assessments
SET
  shuffle_questions = TRUE
WHERE
  id = $assessment_id;

-- BLOCK enable_zone_selection
UPDATE zones
SET
  number_choose = 1
WHERE
  assessment_id = $assessment_id;

-- BLOCK enable_alternative_selection
UPDATE alternative_groups
SET
  number_choose = 1
WHERE
  assessment_id = $assessment_id;
