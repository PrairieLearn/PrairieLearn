-- BLOCK select_submission_variant_id
SELECT
  variant_id
FROM
  submissions
WHERE
  id = $submission_id;
