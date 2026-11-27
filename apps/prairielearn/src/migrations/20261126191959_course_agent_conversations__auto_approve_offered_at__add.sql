-- Set once the conversation has offered its owner auto-approve, so it offers it once.
ALTER TABLE course_agent_conversations
ADD COLUMN IF NOT EXISTS auto_approve_offered_at timestamptz;
