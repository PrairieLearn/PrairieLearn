-- BLOCK select_human_rubric_selections
SELECT
  iq.id AS instance_question_id,
  COALESCE(t.name, u.uid) AS submission_identifier,
  COALESCE(
    ARRAY_AGG(
      ri.description
      ORDER BY
        ri.description
    ) FILTER (
      WHERE
        ri.id IS NOT NULL
    ),
    ARRAY[]::text[]
  ) AS human_descriptions
FROM
  instance_questions AS iq
  JOIN assessment_instances AS ai ON ai.id = iq.assessment_instance_id
  LEFT JOIN users AS u ON u.id = ai.user_id
  LEFT JOIN teams AS t ON t.id = ai.team_id
  JOIN LATERAL (
    SELECT
      gj.id,
      gj.manual_rubric_grading_id
    FROM
      grading_jobs AS gj
      JOIN submissions AS s ON s.id = gj.submission_id
      JOIN variants AS v ON v.id = s.variant_id
    WHERE
      v.instance_question_id = iq.id
      AND gj.grading_method = 'Manual'
      AND gj.deleted_at IS NULL
    ORDER BY
      gj.graded_at DESC NULLS LAST
    LIMIT
      1
  ) AS manual_gj ON TRUE
  LEFT JOIN rubric_grading_items AS rgi ON rgi.rubric_grading_id = manual_gj.manual_rubric_grading_id
  LEFT JOIN rubric_items AS ri ON ri.id = rgi.rubric_item_id
  AND ri.deleted_at IS NULL
WHERE
  iq.assessment_question_id = $assessment_question_id
GROUP BY
  iq.id,
  t.name,
  u.uid;

-- BLOCK select_ai_rubric_selections
SELECT
  iq.id AS instance_question_id,
  COALESCE(t.name, u.uid) AS submission_identifier,
  COALESCE(
    ARRAY_AGG(
      ri.description
      ORDER BY
        ri.description
    ) FILTER (
      WHERE
        ri.id IS NOT NULL
    ),
    ARRAY[]::text[]
  ) AS ai_descriptions
FROM
  instance_questions AS iq
  JOIN assessment_instances AS ai ON ai.id = iq.assessment_instance_id
  LEFT JOIN users AS u ON u.id = ai.user_id
  LEFT JOIN teams AS t ON t.id = ai.team_id
  JOIN LATERAL (
    SELECT
      gj.id,
      gj.manual_rubric_grading_id
    FROM
      grading_jobs AS gj
      JOIN submissions AS s ON s.id = gj.submission_id
      JOIN variants AS v ON v.id = s.variant_id
      JOIN ai_grading_jobs AS agj ON agj.grading_job_id = gj.id
    WHERE
      v.instance_question_id = iq.id
      AND gj.grading_method = 'AI'
      AND gj.deleted_at IS NULL
      AND agj.job_sequence_id = $ai_job_sequence_id
    ORDER BY
      gj.graded_at DESC NULLS LAST
    LIMIT
      1
  ) AS ai_gj ON TRUE
  LEFT JOIN rubric_grading_items AS rgi ON rgi.rubric_grading_id = ai_gj.manual_rubric_grading_id
  LEFT JOIN rubric_items AS ri ON ri.id = rgi.rubric_item_id
  AND ri.deleted_at IS NULL
WHERE
  iq.assessment_question_id = $assessment_question_id
GROUP BY
  iq.id,
  t.name,
  u.uid;
