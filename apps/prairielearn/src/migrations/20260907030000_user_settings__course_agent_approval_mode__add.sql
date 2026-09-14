ALTER TABLE user_settings
ADD COLUMN course_agent_approval_mode TEXT NOT NULL DEFAULT 'ask' CHECK (course_agent_approval_mode IN ('ask', 'always'));
