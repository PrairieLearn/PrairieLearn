ALTER TABLE course_agent_proposals
ADD COLUMN rollback_allowed BOOLEAN,
ADD COLUMN rolled_back_sha TEXT;
