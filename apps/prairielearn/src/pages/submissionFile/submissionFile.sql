-- BLOCK select_variant_id_by_submission_id
SELECT
  variant_id
FROM
  submissions
WHERE
  id = $submission_id;

-- BLOCK select_submission_file
WITH
  submission_with_file AS (
    SELECT
      jsonb_array_elements(s.submitted_answer -> '_files') AS file
    FROM
      submissions AS s
      JOIN variants AS v ON (v.id = s.variant_id)
    WHERE
      s.id = $submission_id
  )
SELECT
  file -> 'contents' AS contents
FROM
  submission_with_file
WHERE
  file ->> 'name' = $file_name
LIMIT
  1;
