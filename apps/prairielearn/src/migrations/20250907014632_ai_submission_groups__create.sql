CREATE TABLE ai_submission_groups (
  assessment_question_id BIGINT NOT NULL REFERENCES assessment_questions (id) ON DELETE CASCADE ON UPDATE CASCADE,
  id BIGSERIAL PRIMARY KEY,
  submission_group_description TEXT NOT NULL,
  submission_group_name TEXT NOT NULL
);

ALTER TABLE ai_submission_groups
ADD CONSTRAINT ai_submission_groups_unique_name_constraint UNIQUE (assessment_question_id, submission_group_name);

-- This is needed in instance_questions.pg for enforcing that instance questions using a 
-- submission group have the same assessment_question_id
ALTER TABLE ai_submission_groups
ADD CONSTRAINT ai_submission_groups_unique_id_constraint UNIQUE (assessment_question_id, id);
