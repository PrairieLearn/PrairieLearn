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

-- BLOCK exhaust_print_export_attempts
UPDATE jobs
SET
  data = data || jsonb_build_object('attempts', 3)
WHERE
  job_sequence_id = $job_sequence_id;

-- BLOCK replace_print_export_owner
UPDATE jobs
SET
  data = data || jsonb_build_object('runOwner', 'replacement-owner')
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

-- BLOCK change_source_question
UPDATE assessment_questions
SET
  deleted_at = now(),
  max_points = max_points + 10
WHERE
  id = $assessment_question_id;

-- BLOCK restore_source_question
UPDATE assessment_questions
SET
  deleted_at = $deleted_at,
  max_points = $max_points
WHERE
  id = $assessment_question_id;

-- BLOCK set_team_work
UPDATE assessments
SET
  team_work = $team_work
WHERE
  id = $assessment_id;
