-- BLOCK compute_next_allowed_grading_time_ms
SELECT
  GREATEST(
    0,
    floor(
      DATE_PART(
        'epoch',
        (
          MAX(
            gj.date + aq.grade_rate_minutes * make_interval(mins => 1)
          ) - CURRENT_TIMESTAMP
        )
      ) * 1000
    )
  )
FROM
  instance_questions iq
  JOIN assessment_questions aq ON (aq.id = iq.assessment_question_id)
  JOIN variants v ON (v.instance_question_id = iq.id)
  JOIN submissions s ON (s.variant_id = v.id)
  JOIN grading_jobs gj ON (gj.submission_id = s.id)
WHERE
  iq.id = $instance_question_id
  AND aq.grade_rate_minutes IS NOT NULL
  AND gj.gradable
  AND gj.grading_method NOT IN ('Manual', 'AI');

-- BLOCK select_pending_instance_questions
SELECT
  to_jsonb(a.*) AS assessment,
  to_jsonb(aq.*) AS assessment_question,
  to_jsonb(iq.*) AS instance_question,
  to_jsonb(r.*) AS rubric,
  s.credit,
  iq.open
  AND aq.max_auto_points > 0
  AND (
    iq.status IN ('saved', 'grading')
    OR COALESCE(s.auto_grading_pending, FALSE)
  ) AS auto_grading_pending
FROM
  instance_questions AS iq
  JOIN assessment_questions AS aq ON aq.id = iq.assessment_question_id
  JOIN assessments AS a ON a.id = aq.assessment_id
  LEFT JOIN rubrics AS r ON r.id = aq.manual_rubric_id
  AND r.deleted_at IS NULL
  LEFT JOIN LATERAL (
    SELECT
      s.credit,
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
      ) AS auto_grading_pending
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
  ) AS s ON TRUE
WHERE
  (
    iq.assessment_instance_id = ANY ($assessment_instance_ids::bigint[])
    OR iq.id = ANY ($instance_question_ids::bigint[])
  )
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
        OR s.auto_grading_pending
      )
    )
  );
