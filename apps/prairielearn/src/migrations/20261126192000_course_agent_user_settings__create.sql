CREATE TYPE enum_course_agent_approval_mode AS ENUM('approval_required', 'always_approve');

CREATE TABLE IF NOT EXISTS course_agent_user_settings (
  user_id bigint NOT NULL REFERENCES users ON UPDATE CASCADE ON DELETE CASCADE,
  course_id bigint NOT NULL REFERENCES courses ON UPDATE CASCADE ON DELETE CASCADE,
  -- The mode a new conversation starts in: the one the user last chose in this course.
  default_approval_mode enum_course_agent_approval_mode NOT NULL DEFAULT 'approval_required',
  PRIMARY KEY (user_id, course_id)
);

CREATE INDEX IF NOT EXISTS course_agent_user_settings_course_id_idx ON course_agent_user_settings (course_id);
