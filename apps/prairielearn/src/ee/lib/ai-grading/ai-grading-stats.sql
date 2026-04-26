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
    SELECT
      ranked.id AS submission_id,
      ranked.instance_question_id
    FROM
      (
        SELECT
          s.id,
          v.instance_question_id,
          ROW_NUMBER() OVER (
            PARTITION BY
              v.instance_question_id
            ORDER BY
              v.date DESC,
              s.date DESC
          ) AS rn
        FROM
          variants AS v
          JOIN submissions AS s ON s.variant_id = v.id
        WHERE
          v.instance_question_id = ANY ($instance_question_ids::bigint[])
      ) ranked
    WHERE
      rn = 1
  ),
  grouped_grading_jobs AS (
    SELECT
      ls.instance_question_id,
      gj.id AS grading_job_id,
      gj.grading_method,
      gj.graded_at,
      gj.manual_points,
      gj.manual_rubric_grading_id,
      gj.graded_by,
      gj.submission_id,
      ROW_NUMBER() OVER (
        PARTITION BY
          gj.grading_method,
          gj.submission_id
        ORDER BY
          gj.graded_at DESC
      ) AS rn
    FROM
      latest_submissions AS ls
      JOIN grading_jobs AS gj ON ls.submission_id = gj.submission_id
    WHERE
      gj.grading_method IN ('Manual', 'AI')
      AND gj.deleted_at IS NULL
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
  grading_job_id,
  grading_method,
  graded_at,
  manual_points,
  manual_rubric_grading_id,
  instance_question_id,
  COALESCE(u.name, u.uid) AS grader_name,
  COALESCE(
    jsonb_agg(to_jsonb(rgti)) FILTER (
      WHERE
        rgti.id IS NOT NULL
    ),
    '[]'::jsonb
  ) AS rubric_items
FROM
  users AS u
  JOIN grouped_grading_jobs AS ggj ON (u.id = ggj.graded_by)
  LEFT JOIN rubric_grading_to_items AS rgti ON (
    ggj.manual_rubric_grading_id = rgti.rubric_grading_id
  )
WHERE
  rn = 1
GROUP BY
  grading_job_id,
  grading_method,
  graded_at,
  manual_points,
  manual_rubric_grading_id,
  instance_question_id,
  u.name,
  u.uid;
