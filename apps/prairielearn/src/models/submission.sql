-- BLOCK select_submission_variant_id
SELECT
  variant_id
FROM
  submissions
WHERE
  id = $submission_id;

-- BLOCK select_submission
SELECT
  *
FROM
  submissions
WHERE
  id = $submission_id;

-- BLOCK select_latest_submission_id_for_variant
SELECT
  id
FROM
  submissions
WHERE
  variant_id = $variant_id
ORDER BY
  date DESC,
  id DESC
LIMIT
  1;
