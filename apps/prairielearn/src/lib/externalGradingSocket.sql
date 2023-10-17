-- BLOCK select_submissions_for_variant
SELECT DISTINCT
  ON (s.id) s.id AS id,
  gj.id AS grading_job_id,
  grading_job_status (gj.id) AS grading_job_status
FROM
  submissions AS s
  JOIN variants AS v ON (v.id = s.variant_id)
  LEFT JOIN grading_jobs AS gj ON (
    gj.submission_id = s.id
    AND gj.grading_method != 'Manual'
  )
WHERE
  v.id = $variant_id
ORDER BY
  s.id,
  gj.id DESC;

-- BLOCK select_submission_for_grading_job
SELECT
  s.id AS id,
  gj.id AS grading_job_id,
  grading_job_status (gj.id) AS grading_job_status,
  s.variant_id AS variant_id
FROM
  grading_jobs AS gj_orig
  JOIN grading_jobs AS gj ON (gj.submission_id = gj_orig.submission_id)
  JOIN submissions AS s ON (s.id = gj.submission_id)
WHERE
  gj_orig.id = $grading_job_id
  AND gj.grading_method != 'Manual'
ORDER BY
  gj.date DESC,
  gj.id DESC
LIMIT
  1;
