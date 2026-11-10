-- BLOCK count_student_records
SELECT
  (
    SELECT
      count(*)::integer
    FROM
      assessment_instances
  ) AS assessments,
  (
    SELECT
      count(*)::integer
    FROM
      instance_questions
  ) AS questions;

-- BLOCK set_preferences
UPDATE assessment_questions
SET
  preferences = $preferences::jsonb
WHERE
  assessment_id = $assessment_id;

-- BLOCK select_variant
SELECT
  *
FROM
  variants
WHERE
  id = $variant_id;

-- BLOCK remove_source_question
UPDATE assessment_questions
SET
  deleted_at = now(),
  max_points = max_points + 10
WHERE
  id = $assessment_question_id;

-- BLOCK group_alternatives
WITH
  numbered AS (
    SELECT
      aq.id,
      aq.alternative_group_id,
      row_number() OVER (
        ORDER BY
          aq.number
      ) AS position
    FROM
      assessment_questions AS aq
      JOIN alternative_groups AS ag ON ag.id = aq.alternative_group_id
      JOIN zones AS z ON z.id = ag.zone_id
    WHERE
      aq.assessment_id = $assessment_id
      AND z.number = 1
  ),
  grouped AS (
    SELECT
      id,
      first_value(alternative_group_id) OVER (
        PARTITION BY
          (position - 1) / 2
        ORDER BY
          position
      ) AS alternative_group_id
    FROM
      numbered
    WHERE
      position <= 6
  )
UPDATE assessment_questions AS aq
SET
  alternative_group_id = grouped.alternative_group_id
FROM
  grouped
WHERE
  aq.id = grouped.id;

-- BLOCK remove_unused_questions
UPDATE assessment_questions AS aq
SET
  deleted_at = now()
FROM
  alternative_groups AS ag,
  zones AS z
WHERE
  aq.assessment_id = $assessment_id
  AND ag.id = aq.alternative_group_id
  AND z.id = ag.zone_id
  AND (
    z.number != 1
    OR aq.number > 6
  );

-- BLOCK limit_alternatives
UPDATE alternative_groups
SET
  number_choose = 1
WHERE
  assessment_id = $assessment_id;

-- BLOCK limit_zones
UPDATE zones
SET
  number_choose = CASE
    WHEN number = 1 THEN 2
    ELSE 0
  END
WHERE
  assessment_id = $assessment_id;

-- BLOCK select_chosen_questions
SELECT
  assessment_question_id
FROM
  assessment_questions_select ($assessment_id, $existing_ids::bigint[]);

-- BLOCK select_question_groups
SELECT
  alternative_group_id
FROM
  assessment_questions
WHERE
  id = ANY ($question_ids::bigint[]);

-- BLOCK select_student_questions
SELECT
  id,
  assessment_question_id
FROM
  instance_questions
WHERE
  assessment_instance_id = $assessment_instance_id
ORDER BY
  id;
