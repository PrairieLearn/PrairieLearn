CREATE TABLE IF NOT EXISTS course_agent_user_settings (
  user_id bigint NOT NULL REFERENCES users ON UPDATE CASCADE ON DELETE CASCADE,
  course_id bigint NOT NULL REFERENCES courses ON UPDATE CASCADE ON DELETE CASCADE,
  -- The mode a new conversation starts in: the one the user last chose in this course.
  approval_mode enum_course_agent_approval_mode NOT NULL DEFAULT 'approval_required',
  -- Set once the user has been offered auto-approve, so the offer is shown only once.
  auto_approve_offered_at timestamptz,
  PRIMARY KEY (user_id, course_id)
);

CREATE INDEX IF NOT EXISTS course_agent_user_settings_course_id_idx ON course_agent_user_settings (course_id);
