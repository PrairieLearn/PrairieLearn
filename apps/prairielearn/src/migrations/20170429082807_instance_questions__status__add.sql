ALTER TABLE instance_questions
ADD COLUMN IF NOT EXISTS status enum_instance_question_status DEFAULT 'unanswered';
