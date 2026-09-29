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
WITH
  combined_zone AS (
    UPDATE alternative_groups
    SET
      zone_id = (
        SELECT
          min(id)
        FROM
          zones
        WHERE
          assessment_id = $assessment_id
      )
    WHERE
      assessment_id = $assessment_id
  )
UPDATE zones
SET
  number_choose = 1
WHERE
  assessment_id = $assessment_id;

-- BLOCK enable_alternative_selection
WITH
  combined_group AS (
    UPDATE assessment_questions
    SET
      alternative_group_id = (
        SELECT
          min(id)
        FROM
          alternative_groups
        WHERE
          assessment_id = $assessment_id
      )
    WHERE
      assessment_id = $assessment_id
  )
UPDATE alternative_groups
SET
  number_choose = 1
WHERE
  assessment_id = $assessment_id;

-- BLOCK close_variants
UPDATE variants AS v
SET
  open = FALSE
FROM
  instance_questions AS iq
WHERE
  v.instance_question_id = iq.id
  AND iq.assessment_instance_id = $assessment_instance_id;

-- BLOCK set_shuffle_questions
UPDATE assessments
SET
  shuffle_questions = $shuffle_questions
WHERE
  id = $assessment_id;

-- BLOCK choose_all_questions
WITH
  updated_zones AS (
    UPDATE zones
    SET
      number_choose = $number_choose
    WHERE
      assessment_id = $assessment_id
  )
UPDATE alternative_groups
SET
  number_choose = $number_choose
WHERE
  assessment_id = $assessment_id;
