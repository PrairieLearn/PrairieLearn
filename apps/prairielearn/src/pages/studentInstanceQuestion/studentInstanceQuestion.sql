-- BLOCK select_last_variant_id
SELECT
  v.id
FROM
  variants AS v
WHERE
  v.instance_question_id = $instance_question_id
  AND v.broken_at IS NULL
ORDER BY
  v.date DESC
LIMIT
  1;

-- BLOCK select_assessment_tools
WITH
  question_zone AS (
    SELECT
      z.id
    FROM
      instance_questions AS iq
      JOIN assessment_questions AS aq ON aq.id = iq.assessment_question_id
      JOIN alternative_groups AS ag ON ag.id = aq.alternative_group_id
      JOIN zones AS z ON z.id = ag.zone_id
    WHERE
      iq.id = $instance_question_id
  )
SELECT
  tool,
  settings
FROM
  assessment_tools
WHERE
  enabled = TRUE
  AND (
    -- Zone-level tools take priority when any exist for this zone
    zone_id = (
      SELECT
        id
      FROM
        question_zone
    )
    OR (
      -- Fall back to assessment-level tools when no zone-level tools exist
      assessment_id = $assessment_id
      AND NOT EXISTS (
        SELECT
          1
        FROM
          assessment_tools
        WHERE
          zone_id = (
            SELECT
              id
            FROM
              question_zone
          )
      )
    )
  );
