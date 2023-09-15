-- BLOCK select_file
SELECT
  id,
  display_filename
FROM
  files
WHERE
  id = $unsafe_file_id
  AND assessment_instance_id = $assessment_instance_id
  AND display_filename = $unsafe_display_filename
  AND deleted_at IS NULL;
