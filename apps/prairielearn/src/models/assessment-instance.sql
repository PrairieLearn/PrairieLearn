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

-- BLOCK select_and_lock_assessment_instance_ids_for_assessment_question
SELECT
  ai.id
FROM
  assessment_instances AS ai
WHERE
  ai.assessment_id = $assessment_id
  AND EXISTS (
    SELECT
      1
    FROM
      instance_questions AS iq
    WHERE
      iq.assessment_instance_id = ai.id
      AND iq.assessment_question_id = $assessment_question_id
      AND (
        $instance_question_ids::bigint[] IS NULL
        OR iq.id = ANY ($instance_question_ids::bigint[])
      )
  )
ORDER BY
  ai.id
FOR NO KEY UPDATE OF
  ai;

-- BLOCK update_assessment_instances_grading_pending
WITH
  pending AS (
    SELECT
      ai.id,
      ai.grading_needed
      OR EXISTS (
        SELECT
          1
        FROM
          instance_questions AS iq
          JOIN assessment_questions AS aq ON aq.id = iq.assessment_question_id
          JOIN assessments AS a ON a.id = aq.assessment_id
        WHERE
          iq.assessment_instance_id = ai.id
          -- Match the questions retained in the assessment's existing grading table.
          AND (
            aq.deleted_at IS NULL
            OR a.type = 'Exam'
          )
          AND (
            (
              iq.requires_manual_grading
              AND iq.status != 'unanswered'
            )
            OR (
              aq.max_auto_points > 0
              AND EXISTS (
                SELECT
                  1
                FROM
                  (
                    SELECT
                      s.id,
                      s.score,
                      s.gradable,
                      s.broken,
                      v.broken_at
                    FROM
                      variants AS v
                      JOIN submissions AS s ON s.variant_id = v.id
                    WHERE
                      v.instance_question_id = iq.id
                    ORDER BY
                      s.date DESC,
                      s.id DESC
                    LIMIT
                      1
                  ) AS latest
                WHERE
                  (
                    latest.score IS NULL
                    AND latest.gradable
                    AND NOT latest.broken
                    AND latest.broken_at IS NULL
                    AND NOT aq.allow_real_time_grading
                  )
                  OR EXISTS (
                    SELECT
                      1
                    FROM
                      grading_jobs AS gj
                    WHERE
                      gj.submission_id = latest.id
                      AND gj.grading_method IN ('Internal', 'External')
                      AND gj.graded_at IS NULL
                      AND gj.grading_request_canceled_at IS NULL
                      AND gj.deleted_at IS NULL
                  )
              )
            )
          )
      ) AS grading_pending
    FROM
      assessment_instances AS ai
    WHERE
      ai.id = ANY ($assessment_instance_ids::bigint[])
  )
UPDATE assessment_instances AS ai
SET
  grading_pending = pending.grading_pending
FROM
  pending
WHERE
  ai.id = pending.id
  AND ai.grading_pending IS DISTINCT FROM pending.grading_pending;

-- BLOCK lock_assessment_instances
SELECT
  ai.id
FROM
  assessment_instances AS ai
WHERE
  ai.id = ANY ($assessment_instance_ids::bigint[])
ORDER BY
  ai.id
FOR NO KEY UPDATE OF
  ai;
