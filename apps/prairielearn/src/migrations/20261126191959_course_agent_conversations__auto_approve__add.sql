CREATE TYPE enum_course_agent_approval_mode AS ENUM('approval_required', 'always_approve');

-- Whether PrairieLearn approves this conversation's reviews for its owner.
ALTER TABLE course_agent_conversations
ADD COLUMN IF NOT EXISTS approval_mode enum_course_agent_approval_mode NOT NULL DEFAULT 'approval_required';

-- Set once the conversation has offered its owner auto-approve, so it offers it once.
ALTER TABLE course_agent_conversations
ADD COLUMN IF NOT EXISTS auto_approve_offered_at timestamptz;
