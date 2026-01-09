CREATE TABLE instance_question_groups (
  assessment_question_id BIGINT NOT NULL REFERENCES assessment_questions (id) ON DELETE CASCADE ON UPDATE CASCADE,
  id BIGSERIAL PRIMARY KEY,
  instance_question_group_description TEXT NOT NULL,
  instance_question_group_name TEXT NOT NULL,
  UNIQUE (
    assessment_question_id,
    instance_question_group_name
  ),
  -- This allows instance_questions to have composite foreign key constraints on the
  -- assessment question ID and instance question group ID of its instance question group. 
  -- These composite foreign keys are used to ensure that instance questions have the same 
  -- assessment question IDs as their corresponding instance question groups.
  UNIQUE (assessment_question_id, id)
);
