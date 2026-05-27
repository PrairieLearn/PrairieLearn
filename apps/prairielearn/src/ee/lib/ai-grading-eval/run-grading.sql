-- BLOCK snapshot_counts
SELECT
  COUNT(*) AS total_instance_questions,
  COUNT(*) FILTER (
    WHERE
      iq.id IN (
        SELECT DISTINCT
          v.instance_question_id
        FROM
          variants AS v
          JOIN submissions AS s ON s.variant_id = v.id
          JOIN grading_jobs AS gj ON gj.submission_id = s.id
        WHERE
          gj.grading_method = 'Manual'
          AND gj.deleted_at IS NULL
      )
  ) AS iqs_with_manual_grading,
  COUNT(*) FILTER (
    WHERE
      iq.id IN (
        SELECT DISTINCT
          v.instance_question_id
        FROM
          variants AS v
          JOIN submissions AS s ON s.variant_id = v.id
          JOIN grading_jobs AS gj ON gj.submission_id = s.id
        WHERE
          gj.grading_method = 'AI'
          AND gj.deleted_at IS NULL
      )
  ) AS iqs_with_ai_grading
FROM
  instance_questions AS iq
WHERE
  iq.assessment_question_id = $assessment_question_id;
