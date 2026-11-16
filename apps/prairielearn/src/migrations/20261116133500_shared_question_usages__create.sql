-- Retain source attribution and destination context after the original records
-- are deleted. These identifiers intentionally do not have foreign keys.
CREATE TABLE shared_question_usages (
  shared_question_id bigint NOT NULL,
  destination_course_id bigint NOT NULL,
  destination_course_instance_id bigint NOT NULL,
  destination_assessment_id bigint NOT NULL,
  destination_user_id bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (
    shared_question_id,
    destination_user_id,
    destination_course_id,
    destination_course_instance_id,
    destination_assessment_id
  )
);

-- Deploy submission recording everywhere before enqueueing historical backfill.
