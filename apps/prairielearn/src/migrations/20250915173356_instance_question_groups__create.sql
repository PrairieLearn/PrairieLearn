CREATE TABLE instance_question_groups (
  assessment_question_id BIGINT NOT NULL REFERENCES assessment_questions (id) ON DELETE CASCADE ON UPDATE CASCADE,
  id BIGSERIAL PRIMARY KEY,
  instance_question_group_description TEXT NOT NULL,
  instance_question_group_name TEXT NOT NULL
);

ALTER TABLE instance_question_groups
ADD CONSTRAINT instance_question_groups_unique_name_constraint UNIQUE (
  assessment_question_id,
  instance_question_group_name
);

-- This is needed in instance_questions.pg for enforcing that instance questions using an
-- instance question group have the same assessment_question_id
ALTER TABLE instance_question_groups
ADD CONSTRAINT instance_question_groups_unique_id_constraint UNIQUE (assessment_question_id, id);
