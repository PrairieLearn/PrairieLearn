CREATE INDEX questions_course_id_publicly_shared_idx ON questions (course_id)
WHERE
  deleted_at IS NULL
  AND (
    share_publicly = TRUE
    OR share_source_publicly = TRUE
  );
