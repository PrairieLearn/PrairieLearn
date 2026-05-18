-- BLOCK ai_grading_cost_stats
SELECT
  COUNT(*)::int AS job_count,
  COALESCE(SUM(cost), 0)::float AS total_cost,
  COALESCE(SUM(prompt_tokens), 0)::int AS total_prompt_tokens,
  COALESCE(SUM(completion_tokens), 0)::int AS total_completion_tokens,
  (
    SELECT
      model
    FROM
      ai_grading_jobs
    WHERE
      job_sequence_id = $job_sequence_id
    GROUP BY
      model
    ORDER BY
      COUNT(*) DESC
    LIMIT
      1
  ) AS dominant_model
FROM
  ai_grading_jobs
WHERE
  job_sequence_id = $job_sequence_id;

-- BLOCK job_sequence_timing
SELECT
  start_date,
  finish_date,
  CASE
    WHEN finish_date IS NULL THEN NULL
    ELSE EXTRACT(
      EPOCH
      FROM
        (finish_date - start_date)
    )
  END AS duration_seconds
FROM
  job_sequences
WHERE
  id = $job_sequence_id;
