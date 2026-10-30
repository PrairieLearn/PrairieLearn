-- BLOCK select_rubric_time
SELECT
  modified_at
FROM
  rubrics
WHERE
  id = $rubric_id;

-- BLOCK select_ai_and_human_grading_jobs_and_rubric
WITH
  latest_submissions AS (
    SELECT DISTINCT
      ON (v.instance_question_id) s.id AS submission_id,
      v.instance_question_id
    FROM
      variants AS v
      JOIN submissions AS s ON s.variant_id = v.id
    WHERE
      v.instance_question_id = ANY ($instance_question_ids::bigint[])
    ORDER BY
      v.instance_question_id ASC,
      v.date DESC,
      s.date DESC
  ),
  rubric_grading_to_items AS (
    SELECT
      rgi.rubric_grading_id,
      ri.*
    FROM
      rubric_grading_items AS rgi
      JOIN rubric_items AS ri ON rgi.rubric_item_id = ri.id
    WHERE
      -- Exclude deleted rubric items. They won't show up elsewhere in the UI
      -- and thus shouldn't be included in comparisons of grading jobs.
      ri.deleted_at IS NULL
  )
SELECT
  -- Grading pages must not load AI request/response payloads across the class.
  -- Prompts contain base64 submission images and can total hundreds of MB.
  -- Completion text is only needed for downloads; fetch it explicitly on export.
  jsonb_build_object(
    'id',
    gj.id,
    'graded_at',
    gj.graded_at,
    'grading_method',
    gj.grading_method,
    'manual_points',
    gj.manual_points,
    'auto_points',
    gj.auto_points,
    'feedback',
    gj.feedback
  ) AS grading_job,
  (
    SELECT
      agj.model
    FROM
      ai_grading_jobs AS agj
    WHERE
      agj.grading_job_id = gj.id
    ORDER BY
      agj.id DESC
    LIMIT
      1
  ) AS ai_grading_model,
  ls.instance_question_id,
  jsonb_build_object(
    'id',
    u.id,
    'name',
    u.name,
    'uid',
    u.uid,
    'uin',
    u.uin,
    'email',
    u.email,
    'institution_id',
    u.institution_id
  ) AS grader,
  to_jsonb(rg.*) AS rubric_grading,
  (
    SELECT
      COALESCE(
        jsonb_agg(
          to_jsonb(rgi.*)
          ORDER BY
            rgi.id
        ),
        '[]'::jsonb
      )
    FROM
      rubric_grading_items AS rgi
    WHERE
      rgi.rubric_grading_id = gj.manual_rubric_grading_id
  ) AS rubric_grading_items,
  COALESCE(
    jsonb_agg(to_jsonb(rgti)) FILTER (
      WHERE
        rgti.id IS NOT NULL
    ),
    '[]'::jsonb
  ) AS rubric_items
FROM
  latest_submissions AS ls
  JOIN grading_jobs AS gj ON gj.submission_id = ls.submission_id
  JOIN users AS u ON u.id = gj.graded_by
  LEFT JOIN rubric_gradings AS rg ON rg.id = gj.manual_rubric_grading_id
  LEFT JOIN rubric_grading_to_items AS rgti ON gj.manual_rubric_grading_id = rgti.rubric_grading_id
WHERE
  gj.grading_method IN ('Manual', 'AI')
  AND gj.deleted_at IS NULL
  AND gj.graded_at IS NOT NULL
GROUP BY
  gj.id,
  ls.instance_question_id,
  u.id,
  rg.id
ORDER BY
  gj.graded_at DESC,
  gj.id DESC;

-- BLOCK select_ai_and_human_scores_for_stats
-- Individual grading pages calculate statistics across the entire class. Keep
-- feedback, grader accounts, saved rubric descriptions, and AI completions out of
-- this query; those details belong in the explicitly requested export projection.
-- A feedback-only or auto-points-only update must not hide an earlier manual score.
WITH
  latest_submissions AS (
    SELECT DISTINCT
      ON (v.instance_question_id) s.id AS submission_id,
      v.instance_question_id
    FROM
      instance_questions AS iq
      JOIN variants AS v ON v.instance_question_id = iq.id
      JOIN submissions AS s ON s.variant_id = v.id
    WHERE
      iq.assessment_question_id = $assessment_question_id
      AND iq.status != 'unanswered'
    ORDER BY
      v.instance_question_id ASC,
      v.date DESC,
      s.date DESC
  ),
  -- Select the latest scores before rubric lookups so older grading updates
  -- don't repeat those lookups.
  score_jobs AS (
    SELECT DISTINCT
      ON (ls.instance_question_id, gj.grading_method) ls.instance_question_id,
      gj.grading_method,
      gj.manual_points,
      gj.manual_rubric_grading_id
    FROM
      latest_submissions AS ls
      JOIN grading_jobs AS gj ON gj.submission_id = ls.submission_id
      JOIN users AS u ON u.id = gj.graded_by
    WHERE
      gj.grading_method IN ('Manual', 'AI')
      AND gj.deleted_at IS NULL
      AND gj.graded_at IS NOT NULL
      AND gj.manual_points IS NOT NULL
    ORDER BY
      ls.instance_question_id ASC,
      gj.grading_method ASC,
      gj.graded_at DESC,
      gj.id DESC
  )
SELECT
  sj.instance_question_id,
  jsonb_build_object(
    'grading_method',
    sj.grading_method,
    'manual_points',
    sj.manual_points,
    'manual_rubric_grading_id',
    sj.manual_rubric_grading_id
  ) AS grading_job,
  ARRAY(
    SELECT
      ri.id
    FROM
      rubric_grading_items AS rgi
      JOIN rubric_items AS ri ON ri.id = rgi.rubric_item_id
    WHERE
      rgi.rubric_grading_id = sj.manual_rubric_grading_id
      AND ri.deleted_at IS NULL
  ) AS rubric_item_ids
FROM
  score_jobs AS sj;

-- BLOCK select_ai_grading_completions_for_export
-- Load only completions for the requested export's grading jobs. Prompts contain
-- base64 images and must never be serialized here, even for downloads.
SELECT
  gj.id AS grading_job_id,
  (
    SELECT
      agj.completion
    FROM
      ai_grading_jobs AS agj
    WHERE
      agj.grading_job_id = gj.id
    ORDER BY
      agj.id DESC
    LIMIT
      1
  ) AS completion
FROM
  grading_jobs AS gj
  JOIN submissions AS s ON s.id = gj.submission_id
  JOIN variants AS v ON v.id = s.variant_id
  JOIN instance_questions AS iq ON iq.id = v.instance_question_id
WHERE
  iq.assessment_question_id = $assessment_question_id
  AND gj.id = ANY ($grading_job_ids::bigint[])
  AND gj.grading_method = 'AI'
  -- Jobs deleted after the table loaded are intentionally omitted. We accept
  -- exporting the table's score snapshot with null AI text in that case.
  AND gj.deleted_at IS NULL
  AND gj.graded_at IS NOT NULL;
