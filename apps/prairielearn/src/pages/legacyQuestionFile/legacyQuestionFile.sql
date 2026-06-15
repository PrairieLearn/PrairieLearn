-- BLOCK check_client_files
SELECT
  (
    (
      $filename IN (
        SELECT
          unnest(q.client_files)
      )
    )
    OR (
      $filename = 'client.js'
      AND (
        type = 'MultipleChoice'
        OR type = 'Checkbox'
        OR type = 'MultipleTrueFalse'
        OR type = 'File'
      )
    )
  ) AS access_allowed
FROM
  questions AS q
WHERE
  q.id = $question_id;
