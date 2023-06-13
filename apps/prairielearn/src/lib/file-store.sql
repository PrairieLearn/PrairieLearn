-- BLOCK select_file
SELECT
  *
FROM
  files AS f
WHERE
  f.id = $file_id
  AND f.deleted_at IS NULL;
