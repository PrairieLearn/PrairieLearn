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

-- BLOCK select_grading_pending
-- This mirrors the per-question "pending" badges in `InstanceQuestionPoints`
-- so that the overall status always agrees with the student's question table.
SELECT
  iq.assessment_instance_id,
  -- Staff can tag unanswered questions for manual grading, but there is
  -- nothing to grade, and the manual grading queue excludes them too.
  bool_or(
    iq.requires_manual_grading
    AND iq.status != 'unanswered'
  ) AS manual,
  -- A saved answer to a manual-only question has no auto points to wait for.
  bool_or(
    iq.status = 'saved'
    AND (
      coalesce(aq.max_auto_points, 0) > 0
      OR coalesce(aq.max_manual_points, 0) = 0
    )
  ) AS saved,
  bool_or(
    iq.status = 'grading'
    AND (
      coalesce(aq.max_auto_points, 0) > 0
      OR coalesce(aq.max_manual_points, 0) = 0
    )
  ) AS grading,
  a.type AS assessment_type,
  ai.open
FROM
  instance_questions AS iq
  JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
  JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
  JOIN assessments AS a ON (a.id = aq.assessment_id)
  JOIN alternative_groups AS ag ON (ag.id = aq.alternative_group_id)
  JOIN zones AS z ON (z.id = ag.zone_id)
WHERE
  iq.assessment_instance_id = ANY ($assessment_instance_ids::bigint[])
  AND (
    iq.requires_manual_grading
    OR iq.status IN ('saved', 'grading')
  )
  -- Removed questions are still shown to students on exams.
  AND (
    aq.deleted_at IS NULL
    OR a.type = 'Exam'
  )
GROUP BY
  iq.assessment_instance_id,
  a.type,
  ai.open;
