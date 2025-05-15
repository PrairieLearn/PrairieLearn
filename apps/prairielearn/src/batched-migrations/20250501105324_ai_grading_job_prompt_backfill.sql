-- BLOCK select_bounds
SELECT
  max(id)
FROM
  ai_grading_jobs;

-- BLOCK update_ai_grading_job_prompt_type
UPDATE ai_grading_jobs
SET
  prompt = (
    SELECT
      jsonb_agg(elem::jsonb)
    FROM
      jsonb_array_elements_text(prompt) AS elem
  )
WHERE
  jsonb_typeof(prompt) = 'array'
  AND EXISTS (
    SELECT
      1
    FROM
      jsonb_array_elements(prompt) AS elem
    WHERE
      jsonb_typeof(elem) = 'string'
  )
  AND id >= $start
  AND id <= $end;
