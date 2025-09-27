CREATE TABLE instance_question_groups (
  assessment_question_id BIGINT NOT NULL REFERENCES assessment_questions (id) ON DELETE CASCADE ON UPDATE CASCADE,
  id BIGSERIAL PRIMARY KEY,
  instance_question_group_description TEXT NOT NULL,
  instance_question_group_name TEXT NOT NULL,
  UNIQUE (
    assessment_question_id,
    instance_question_group_name
  ),
  -- This lets the instance questions table create composite foreign key constraints on the
  -- assessment question ID and instance question group ID of its instance question group. 
  -- These are used to ensure that the assessment question ID matches between the referencing 
  -- instance question and referenced instance question group.
  UNIQUE (assessment_question_id, id)
);
