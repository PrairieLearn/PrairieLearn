CREATE TABLE instance_question_groups (
  assessment_question_id BIGINT NOT NULL REFERENCES assessment_questions (id) ON DELETE CASCADE ON UPDATE CASCADE,
  id BIGSERIAL PRIMARY KEY,
  instance_question_group_description TEXT NOT NULL,
  instance_question_group_name TEXT NOT NULL,
  UNIQUE (assessment_question_id, instance_question_group_name)
);

-- This is needed to enforce that instance questions in the same
-- instance question group have the same assessment_question_id
ALTER TABLE instance_question_groups
ADD CONSTRAINT instance_question_groups_unique_id_constraint UNIQUE (assessment_question_id, id);
