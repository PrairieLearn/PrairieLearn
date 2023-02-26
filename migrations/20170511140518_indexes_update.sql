CREATE INDEX IF NOT EXISTS assessment_instances_user_id_idx ON assessment_instances (user_id);

CREATE INDEX IF NOT EXISTS assessment_questions_assessment_id_idx ON assessment_questions (assessment_id);

CREATE INDEX IF NOT EXISTS assessment_questions_alternative_group_id_idx ON assessment_questions (alternative_group_id);

CREATE INDEX IF NOT EXISTS assessment_score_logs_assessment_instance_id_idx ON assessment_score_logs (assessment_instance_id);

CREATE INDEX IF NOT EXISTS assessment_state_logs_assessment_instance_id_idx ON assessment_state_logs (assessment_instance_id);

CREATE INDEX IF NOT EXISTS assessments_course_instance_id_idx ON assessments (course_instance_id);

CREATE INDEX IF NOT EXISTS assessments_assessment_set_id_idx ON assessments (assessment_set_id);

CREATE INDEX IF NOT EXISTS course_instances_course_id_idx ON course_instances (course_id);

CREATE INDEX IF NOT EXISTS course_permissions_course_id_idx ON course_permissions (course_id);

CREATE INDEX IF NOT EXISTS enrollments_course_instance_id_idx ON enrollments (course_instance_id);

CREATE INDEX IF NOT EXISTS grading_logs_submission_id_idx ON grading_logs (submission_id);

CREATE INDEX IF NOT EXISTS instance_questions_assessment_instance_id_idx ON instance_questions (assessment_instance_id);

CREATE INDEX IF NOT EXISTS job_sequences_assessment_id_idx ON job_sequences (assessment_id);

CREATE INDEX IF NOT EXISTS job_sequences_course_id_idx ON job_sequences (course_id);

CREATE INDEX IF NOT EXISTS question_score_logs_instance_question_id_idx ON question_score_logs (instance_question_id);

CREATE INDEX IF NOT EXISTS question_tags_tag_id_idx ON question_tags (tag_id);

CREATE INDEX IF NOT EXISTS questions_topic_id_idx ON questions (topic_id);

CREATE INDEX IF NOT EXISTS submissions_variant_id_idx ON submissions (variant_id);

CREATE INDEX IF NOT EXISTS variant_view_logs_variant_id_idx ON variant_view_logs (variant_id);
