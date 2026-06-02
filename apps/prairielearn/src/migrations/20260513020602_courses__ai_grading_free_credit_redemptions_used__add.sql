ALTER TABLE courses
ADD COLUMN ai_grading_free_credit_redemptions_used INT NOT NULL DEFAULT 0 CONSTRAINT courses_ai_grading_free_credit_redemptions_used_check CHECK (ai_grading_free_credit_redemptions_used >= 0);
