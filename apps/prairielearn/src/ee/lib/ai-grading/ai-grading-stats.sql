-- BLOCK select_ai_and_human_grading_jobs_batch
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
          v.instance_question_id = ANY ($instance_question_ids::BIGINT[])
      ) ranked
    WHERE
      rn = 1
  ),
  grouped_grading_jobs AS (
    SELECT
      gj.id grading_job_id,
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
      submissions s
      JOIN grading_jobs gj ON s.id = gj.submission_id
      JOIN latest_submissions ON s.id = latest_submissions.submission_id
    WHERE
      gj.grading_method IN ('Manual', 'AI')
  )
SELECT
  grading_job_id,
  grading_method,
  graded_at,
  manual_points,
  manual_rubric_grading_id,
  instance_question_id,
  COALESCE(u.name, u.uid) AS grader_name
FROM
  users AS u
  JOIN grouped_grading_jobs AS ggj ON (u.user_id = ggj.graded_by)
  JOIN latest_submissions AS ls ON (ggj.submission_id = ls.submission_id)
WHERE
  rn = 1;

-- BLOCK select_rubric_time
SELECT
  modified_at
FROM
  rubrics
WHERE
  id = $manual_rubric_id;

-- BLOCK select_rubric_grading_items
SELECT
  ri.*
FROM
  rubric_grading_items AS rgi
  JOIN rubric_items AS ri ON rgi.rubric_item_id = ri.id
WHERE
  rgi.rubric_grading_id = $manual_rubric_grading_id;

-- BLOCK select_rubric_grading_items_batch
SELECT
  rgi.rubric_grading_id,
  ri.*
FROM
  rubric_grading_items AS rgi
  JOIN rubric_items AS ri ON rgi.rubric_item_id = ri.id
WHERE
  rgi.rubric_grading_id = ANY ($manual_rubric_grading_ids::BIGINT[]);
