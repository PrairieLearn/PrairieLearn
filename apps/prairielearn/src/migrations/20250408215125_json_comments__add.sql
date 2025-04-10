ALTER TABLE alternative_groups
ADD COLUMN json_comment text;

ALTER TABLE assessment_access_rules
ADD COLUMN json_comment text;

ALTER TABLE assessment_questions
ADD COLUMN json_comment text;

ALTER TABLE assessment_sets
ADD COLUMN json_comment text;

ALTER TABLE assessments
ADD COLUMN json_comment text;

ALTER TABLE course_instance_access_rules
ADD COLUMN json_comment text;

ALTER TABLE course_instances
ADD COLUMN json_comment text;

ALTER TABLE pl_courses
ADD COLUMN json_comment text;

ALTER TABLE questions
ADD COLUMN json_comment text,
ADD COLUMN json_workspace_comment text,
ADD COLUMN json_external_grading_comment text;

ALTER TABLE tags
ADD COLUMN json_comment text;

ALTER TABLE topics
ADD COLUMN json_comment text;

ALTER TABLE zones
ADD COLUMN json_comment text;
