CREATE INDEX idx_questions_public_share ON questions (course_id)
WHERE
  deleted_at IS NULL
  AND (
    share_publicly = TRUE
    OR share_source_publicly = TRUE
  );
