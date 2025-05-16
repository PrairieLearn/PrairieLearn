-- BLOCK select_file_transfer
SELECT
  ft.*
FROM
  file_transfers AS ft
WHERE
  ft.id = $id
  AND ft.deleted_at IS NULL;

-- BLOCK select_assessment_id_from_uuid
SELECT
  a.id AS assessment_id
FROM
  assessments AS a
WHERE
  a.uuid = $uuid
  AND a.course_instance_id = $course_instance_id
  AND a.deleted_at IS NULL;

-- BLOCK soft_delete_file_transfer
UPDATE file_transfers AS ft
SET
  deleted_at = CURRENT_TIMESTAMP
WHERE
  ft.id = $id
  AND ft.user_id = $user_id
  AND ft.deleted_at IS NULL
RETURNING
  ft.id;

-- BLOCK select_course_from_course_id
SELECT
  c.*
FROM
  pl_courses as c
WHERE
  c.id = $course_id
  AND c.deleted_at IS NULL;
