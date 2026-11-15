CREATE TYPE enum_course_agent_approval_mode AS ENUM('approval_required', 'always_approve');

-- A user's course agent preferences in one course.
CREATE TABLE IF NOT EXISTS course_agent_user_settings (
  user_id bigint NOT NULL REFERENCES users ON UPDATE CASCADE ON DELETE CASCADE,
  course_id bigint NOT NULL REFERENCES courses ON UPDATE CASCADE ON DELETE CASCADE,
  -- Whether the user decides each review of the agent's course changes or they are approved for them.
  approval_mode enum_course_agent_approval_mode NOT NULL DEFAULT 'approval_required',
  PRIMARY KEY (user_id, course_id)
);
