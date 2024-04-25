-- BLOCK select_files
SELECT
  *
FROM
  files
WHERE
  deleted_at IS NULL;
