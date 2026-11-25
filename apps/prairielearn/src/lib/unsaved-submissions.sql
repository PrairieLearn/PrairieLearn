-- BLOCK select_pending_recovered_submission_ids
SELECT
  s.id
FROM
  submissions AS s
  JOIN variants AS v ON (v.id = s.variant_id)
  JOIN questions AS q ON (q.id = v.question_id)
  JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
  JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
  JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
  JOIN assessments AS a ON (a.id = ai.assessment_id)
  JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
  JOIN courses AS c ON (c.id = v.course_id)
WHERE
  s.recovered_from_user_id IS NOT NULL
  AND s.score IS NULL
  AND s.graded_at IS NULL
  AND (
    s.grading_requested_at IS NULL
    OR EXISTS (
      SELECT
        1
      FROM
        grading_jobs AS gj
      WHERE
        gj.id = (
          SELECT
            latest.id
          FROM
            grading_jobs AS latest
          WHERE
            latest.submission_id = s.id
          ORDER BY
            latest.id DESC
          LIMIT
            1
        )
        AND gj.graded_at IS NULL
        AND gj.grading_request_canceled_at IS NULL
        AND (
          gj.grading_method = 'Internal'
          OR (
            gj.grading_method = 'External'
            AND gj.grading_submitted_at IS NULL
            AND gj.grading_received_at IS NULL
          )
        )
    )
  )
  AND s.gradable IS TRUE
  AND s.broken IS NOT TRUE
  AND v.broken_at IS NULL
  AND q.deleted_at IS NULL
  AND a.deleted_at IS NULL
  AND ci.deleted_at IS NULL
  AND c.deleted_at IS NULL
  AND NOT (
    COALESCE(aq.max_auto_points, 0) = 0
    AND COALESCE(aq.max_manual_points, 0) != 0
  )
  AND NOT EXISTS (
    SELECT
      1
    FROM
      submissions AS newer
      JOIN variants AS newer_variant ON (newer_variant.id = newer.variant_id)
    WHERE
      newer_variant.instance_question_id = v.instance_question_id
      AND (newer.date, newer.id) > (s.date, s.id)
  )
ORDER BY
  s.id;

-- BLOCK select_recovered_submission_for_grading
SELECT
  jsonb_build_object(
    'id',
    s.id,
    'auth_user_id',
    s.auth_user_id,
    'recovered_from_user_id',
    s.recovered_from_user_id
  ) AS submission,
  to_jsonb(v.*) AS variant,
  to_jsonb(q.*) AS question,
  to_jsonb(c.*) AS course
FROM
  submissions AS s
  JOIN variants AS v ON (v.id = s.variant_id)
  JOIN questions AS q ON (q.id = v.question_id)
  JOIN courses AS c ON (c.id = v.course_id)
WHERE
  s.id = $submission_id
  AND s.recovered_from_user_id IS NOT NULL
  AND q.deleted_at IS NULL
  AND c.deleted_at IS NULL;
