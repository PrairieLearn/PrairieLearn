-- BLOCK select_assessment_instance_by_id
SELECT
  *
FROM
  assessment_instances
WHERE
  id = $assessment_instance_id;

-- BLOCK select_assessment_has_instances
SELECT
  EXISTS (
    SELECT
      1
    FROM
      assessment_instances
    WHERE
      assessment_id = $assessment_id
  );

-- BLOCK insert_group_assessment_instance
INSERT INTO
  assessment_instances (auth_user_id, assessment_id, team_id, number)
VALUES
  ($authn_user_id, $assessment_id, $team_id, 1)
RETURNING
  *;

-- BLOCK update_assessment_instances_time_limit
WITH
  results AS (
    UPDATE assessment_instances AS ai
    SET
      open = TRUE,
      auto_close = FALSE,
      date_limit = CASE
        WHEN $base_time = 'null' THEN NULL
        WHEN $base_time = 'exact_date' THEN $exact_date
        ELSE GREATEST(
          current_timestamp,
          (
            CASE
              WHEN $base_time = 'start_date' THEN ai.date
              WHEN $base_time = 'current_date' THEN current_timestamp
              ELSE ai.date_limit
            END
          ) + make_interval(mins => $time_add)
        )
      END,
      modified_at = now()
    WHERE
      ai.assessment_id = $assessment_id
      AND (
        $assessment_instance_ids::bigint[] IS NULL
        OR ai.id = ANY ($assessment_instance_ids::bigint[])
      )
      AND (
        ai.open
        OR $reopen_closed
      )
      AND (
        ai.date_limit IS NOT NULL
        OR $base_time != 'date_limit'
      )
    RETURNING
      ai.open,
      ai.id AS assessment_instance_id,
      ai.date_limit
  )
INSERT INTO
  assessment_state_logs AS asl (
    open,
    assessment_instance_id,
    date_limit,
    auth_user_id
  ) (
    SELECT
      TRUE,
      results.assessment_instance_id,
      results.date_limit,
      $authn_user_id
    FROM
      results
  );

-- BLOCK select_and_lock_assessment_instances_for_pending_clear
SELECT
  ai.id
FROM
  assessment_instances AS ai
  LEFT JOIN teams AS t ON (
    t.id = ai.team_id
    AND t.deleted_at IS NULL
  )
WHERE
  ai.assessment_id = $assessment_id
  AND (
    $assessment_instance_ids::bigint[] IS NULL
    OR ai.id = ANY ($assessment_instance_ids::bigint[])
  )
  AND (
    ai.team_id IS NULL
    OR t.id IS NOT NULL
  )
ORDER BY
  ai.id
FOR NO KEY UPDATE OF
  ai;

-- BLOCK clear_assessment_instances_grading_pending
UPDATE instance_questions
SET
  grading_pending = FALSE
WHERE
  assessment_instance_id = ANY ($assessment_instance_ids::bigint[])
  AND grading_pending;

-- BLOCK select_grading_pending_assessment_instance_ids
SELECT DISTINCT
  iq.assessment_instance_id
FROM
  instance_questions AS iq
  JOIN assessment_questions AS aq ON aq.id = iq.assessment_question_id
  JOIN assessments AS a ON a.id = aq.assessment_id
  JOIN alternative_groups AS ag ON ag.id = aq.alternative_group_id
  JOIN zones AS z ON z.id = ag.zone_id
WHERE
  iq.assessment_instance_id = ANY ($assessment_instance_ids::bigint[])
  AND iq.grading_pending
  AND (
    aq.deleted_at IS NULL
    OR a.type = 'Exam'
  );
