-- After running with the original code in production, we realized that Postgres
-- wasn't able to utilize the original index during our most common query,
-- `select_metadata_for_chunks`. By reordering the fields, Postgres should be
-- able to use the index on `course_id` when selecting chunks.
ALTER INDEX chunks_unique_values_key
RENAME TO chunks_unique_values_key_old;

CREATE UNIQUE INDEX chunks_unique_values_key ON chunks (
  course_id,
  type,
  coalesce(question_id, -1),
  coalesce(course_instance_id, -1),
  coalesce(assessment_id, -1)
);

DROP INDEX chunks_unique_values_key_old;
