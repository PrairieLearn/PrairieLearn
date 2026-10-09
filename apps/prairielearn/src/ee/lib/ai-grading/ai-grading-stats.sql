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
  to_jsonb(gj.*) AS grading_job,
  ls.instance_question_id,
  to_jsonb(u.*) AS grader,
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
