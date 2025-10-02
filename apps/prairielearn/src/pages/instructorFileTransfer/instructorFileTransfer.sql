-- BLOCK select_file_transfer
SELECT
  ft.*
FROM
  file_transfers AS ft
WHERE
  ft.id = $id
  AND ft.deleted_at IS NULL;

-- BLOCK soft_delete_file_transfer
UPDATE file_transfers AS ft
SET
  deleted_at = CURRENT_TIMESTAMP
WHERE
  ft.id = $id
  AND ft.user_id = $user_id
  AND ft.deleted_at IS NULL;
