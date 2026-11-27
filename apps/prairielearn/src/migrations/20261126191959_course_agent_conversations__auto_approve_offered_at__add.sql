CREATE TYPE enum_course_agent_approval_mode AS ENUM('approval_required', 'always_approve');

-- Set once the conversation has offered its owner auto-approve, so it offers it once.
ALTER TABLE course_agent_conversations
ADD COLUMN IF NOT EXISTS auto_approve_offered_at timestamptz;
