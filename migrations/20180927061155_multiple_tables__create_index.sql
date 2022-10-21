CREATE INDEX IF NOT EXISTS current_pages_assessment_instance_id_idx ON current_pages (assessment_instance_id);
CREATE INDEX IF NOT EXISTS current_pages_variant_id_idx ON current_pages (variant_id);
CREATE INDEX IF NOT EXISTS page_view_logs_assessment_instance_id_idx ON page_view_logs (assessment_instance_id);
CREATE INDEX IF NOT EXISTS page_view_logs_variant_id_idx ON page_view_logs (variant_id);
CREATE INDEX IF NOT EXISTS question_score_logs_grading_job_id_idx ON question_score_logs (grading_job_id);
