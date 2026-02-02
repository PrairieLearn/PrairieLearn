ALTER TABLE ai_grading_jobs IF NOT EXISTS
ADD COLUMN rotation_correction_degrees JSONB;
