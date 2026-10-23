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

-- BLOCK select_assessment_instance_ids_for_pending_score_refresh
SELECT
  ai.id
FROM
  assessment_instances AS ai
  JOIN assessments AS a ON a.id = ai.assessment_id
WHERE
  (
    $course_instance_id::bigint IS NULL
    OR a.course_instance_id = $course_instance_id
  )
  AND (
    $start_id::bigint IS NULL
    OR ai.id >= $start_id
  )
  AND (
    $end_id::bigint IS NULL
    OR ai.id <= $end_id
  )
  AND (
    ai.grading_pending
    OR ai.score_perc_pending != 0
    OR EXISTS (
      SELECT
        1
      FROM
        instance_questions AS iq
        JOIN assessment_questions AS aq ON aq.id = iq.assessment_question_id
      WHERE
        iq.assessment_instance_id = ai.id
        AND (
          aq.deleted_at IS NULL
          OR a.type = 'Exam'
        )
        AND iq.status != 'unanswered'
        AND (
          iq.requires_manual_grading
          OR (
            iq.open
            AND aq.max_auto_points > 0
            AND (
              iq.status IN ('saved', 'grading')
              OR EXISTS (
                SELECT
                  1
                FROM
                  (
                    SELECT
                      s.id,
                      s.score,
                      s.gradable,
                      s.broken
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
                  ) AS s
                WHERE
                  (
                    (
                      s.score IS NULL
                      AND s.gradable
                      AND NOT s.broken
                    )
                    OR EXISTS (
                      SELECT
                        1
                      FROM
                        grading_jobs AS gj
                      WHERE
                        gj.submission_id = s.id
                        AND gj.graded_at IS NULL
                        AND gj.grading_request_canceled_at IS NULL
                    )
                  )
              )
            )
          )
        )
    )
  )
ORDER BY
  ai.id;

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
