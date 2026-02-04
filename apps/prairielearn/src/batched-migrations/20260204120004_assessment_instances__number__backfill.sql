-- BLOCK select_bounds
SELECT
  MAX(id)
FROM
  assessment_instances;

-- BLOCK update_assessment_instances_number
WITH
  numbered_instances AS (
    SELECT
      ai.id,
      COALESCE(
        (
          SELECT
            MAX(ai2.number)
          FROM
            assessment_instances ai2
          WHERE
            ai2.assessment_id = ai.assessment_id
            AND (
              (
                ai.user_id IS NOT NULL
                AND ai2.user_id = ai.user_id
              )
              OR (
                ai.team_id IS NOT NULL
                AND ai2.team_id = ai.team_id
              )
            )
        ),
        0
      ) + ROW_NUMBER() OVER (
        PARTITION BY
          ai.assessment_id,
          ai.user_id,
          ai.team_id
        ORDER BY
          ai.id
      ) AS new_number
    FROM
      assessment_instances ai
    WHERE
      ai.id >= $start
      AND ai.id <= $end
      AND ai.number IS NULL
  )
UPDATE assessment_instances
SET
  number = numbered_instances.new_number
FROM
  numbered_instances
WHERE
  assessment_instances.id = numbered_instances.id;
