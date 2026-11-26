CREATE TYPE enum_course_agent_approval_mode AS ENUM('approval_required', 'always_approve');

-- Whether PrairieLearn approves the conversation's submitted changes without asking its owner.
ALTER TABLE course_agent_conversations
ADD COLUMN IF NOT EXISTS approval_mode enum_course_agent_approval_mode NOT NULL DEFAULT 'approval_required';
