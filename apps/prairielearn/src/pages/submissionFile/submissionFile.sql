-- BLOCK select_submission_file
WITH
  submission_with_file AS (
    SELECT
      s.id,
      jsonb_array_elements(s.submitted_answer -> '_files') AS file
    FROM
      submissions AS s
      JOIN variants AS v ON (v.id = s.variant_id)
    WHERE
      s.id = $submission_id
      -- We check both `question_id` and `instance_question_id` to make sure that
      -- this submission is actually accessible by the user. Both will have been
      -- validated by middleware. For the instructor preview page, we don't have
      -- an instance question, so we ignore it in that case.
      AND v.question_id = $question_id
      AND (
        ($instance_question_id::bigint IS NULL)
        OR (v.instance_question_id = $instance_question_id)
      )
  )
SELECT
  file -> 'contents' AS contents
FROM
  submission_with_file AS s
WHERE
  file ->> 'name' = $file_name
LIMIT
  1;
