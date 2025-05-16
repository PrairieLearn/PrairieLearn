-- BLOCK select_ai_and_human_grading_jobs
SELECT
  grading_job_id,
  grading_method,
  graded_at,
  manual_rubric_grading_id
FROM
  (
    SELECT
      gj.id grading_job_id,
      gj.grading_method,
      gj.graded_at,
      gj.manual_rubric_grading_id,
      ROW_NUMBER() OVER (
        PARTITION BY
          gj.grading_method
        ORDER BY
          gj.graded_at DESC
      ) AS rn
    FROM
      instance_questions iq
      JOIN variants v ON iq.id = v.instance_question_id
      JOIN submissions s ON v.id = s.variant_id
      JOIN grading_jobs gj ON s.id = gj.submission_id
    WHERE
      iq.id = $instance_question_id
      AND gj.grading_method IN ('Manual', 'AI')
  ) grouped_grading_jobs
WHERE
  rn = 1;

-- BLOCK select_rubric_time
SELECT
  modified_at
FROM
  rubrics
WHERE
  id = $manual_rubric_id;
