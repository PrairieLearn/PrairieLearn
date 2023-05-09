-- BLOCK select_file_transfer
SELECT
  ft.*
FROM
  file_transfers AS ft
WHERE
  ft.id = $id
  AND ft.deleted_at IS NULL;

-- BLOCK select_question_id_from_uuid
SELECT
  q.id AS question_id
FROM
  questions AS q
WHERE
  q.uuid = $uuid
  AND q.course_id = $course_id -- TODO: change when we have a way for instructors to copy questions shared with their course
  AND q.deleted_at IS NULL;

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
