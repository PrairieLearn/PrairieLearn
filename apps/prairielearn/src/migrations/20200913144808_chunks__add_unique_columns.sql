CREATE UNIQUE INDEX chunks_unique_values_key ON chunks (
  type,
  course_id,
  coalesce(question_id, -1),
  coalesce(course_instance_id, -1),
  coalesce(assessment_id, -1)
);
