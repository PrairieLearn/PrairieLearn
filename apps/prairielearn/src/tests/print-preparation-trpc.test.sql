-- BLOCK set_multiple_instance
UPDATE assessments
SET
  multiple_instance = $multiple_instance
WHERE
  id = $assessment_id;

-- BLOCK age_print_export_job
UPDATE jobs
SET
  finish_date = CURRENT_TIMESTAMP - INTERVAL '25 hours'
WHERE
  job_sequence_id = $job_sequence_id;

-- BLOCK add_print_export_input_key
UPDATE jobs
SET
  data = data || jsonb_build_object('inputKey', $input_key::text)
WHERE
  job_sequence_id = $job_sequence_id;

-- BLOCK age_print_export_sequence
UPDATE job_sequences
SET
  finish_date = CURRENT_TIMESTAMP - INTERVAL '25 hours'
WHERE
  id = $job_sequence_id;

-- BLOCK expire_print_export_lease
UPDATE jobs
SET
  data = data || jsonb_build_object(
    'attempts',
    3,
    'leaseUntil',
    (CURRENT_TIMESTAMP - INTERVAL '1 minute')::text
  )
WHERE
  job_sequence_id = $job_sequence_id;

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
