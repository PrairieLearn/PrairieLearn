CREATE TABLE IF NOT EXISTS audit_events (
  id BIGSERIAL PRIMARY KEY,
  date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  action TEXT NOT NULL,
  action_detail TEXT NOT NULL,
  table_name TEXT NOT NULL,
  agent_authn_user_id BIGINT NOT NULL,
  agent_user_id BIGINT NOT NULL,
  subject_institution_id BIGINT,
  subject_course_id BIGINT,
  subject_course_instance_id BIGINT,
  subject_assessment_id BIGINT,
  subject_assessment_instance_id BIGINT,
  subject_assessment_question_id BIGINT,
  subject_group_id BIGINT,
  subject_user_id BIGINT,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  old_row JSONB NOT NULL DEFAULT '{}'::jsonb,
  new_row JSONB NOT NULL DEFAULT '{}'::jsonb,
  row_id BIGINT NOT NULL
);

-- Table-specific events
CREATE INDEX IF NOT EXISTS audit_events_table_name_idx ON audit_events (table_name);

-- Events that affect a user
CREATE INDEX IF NOT EXISTS audit_events_subject_user_id_idx ON audit_events (subject_user_id);

-- Specific types of events that affect a user
CREATE INDEX IF NOT EXISTS audit_events_table_name_subject_user_id_idx ON audit_events (table_name, subject_user_id);

-- Events caused by a user
CREATE INDEX IF NOT EXISTS audit_events_agent_authn_user_id_idx ON audit_events (agent_authn_user_id);

-- Add foreign key constraints
ALTER TABLE audit_events
ADD CONSTRAINT audit_events_agent_authn_user_id_fkey FOREIGN KEY (agent_authn_user_id) REFERENCES users (user_id) ON UPDATE CASCADE ON DELETE SET NULL,
ADD CONSTRAINT audit_events_agent_user_id_fkey FOREIGN KEY (agent_user_id) REFERENCES users (user_id) ON UPDATE CASCADE ON DELETE SET NULL,
ADD CONSTRAINT audit_events_subject_course_id_fkey FOREIGN KEY (subject_course_id) REFERENCES pl_courses (id) ON UPDATE CASCADE ON DELETE SET NULL,
ADD CONSTRAINT audit_events_subject_course_instance_id_fkey FOREIGN KEY (subject_course_instance_id) REFERENCES course_instances (id) ON UPDATE CASCADE ON DELETE SET NULL,
ADD CONSTRAINT audit_events_subject_group_id_fkey FOREIGN KEY (subject_group_id) REFERENCES groups (id) ON UPDATE CASCADE ON DELETE SET NULL,
ADD CONSTRAINT audit_events_subject_user_id_fkey FOREIGN KEY (subject_user_id) REFERENCES users (user_id) ON UPDATE CASCADE ON DELETE SET NULL,
ADD CONSTRAINT audit_events_subject_institution_id_fkey FOREIGN KEY (subject_institution_id) REFERENCES institutions (id) ON UPDATE CASCADE ON DELETE SET NULL,
ADD CONSTRAINT audit_events_subject_assessment_id_fkey FOREIGN KEY (subject_assessment_id) REFERENCES assessments (id) ON UPDATE CASCADE ON DELETE SET NULL,
ADD CONSTRAINT audit_events_subject_assessment_instance_id_fkey FOREIGN KEY (subject_assessment_instance_id) REFERENCES assessment_instances (id) ON UPDATE CASCADE ON DELETE SET NULL,
ADD CONSTRAINT audit_events_subject_assessment_question_id_fkey FOREIGN KEY (subject_assessment_question_id) REFERENCES assessment_questions (id) ON UPDATE CASCADE ON DELETE SET NULL;

-- Add comments for documentation
COMMENT ON TABLE audit_events IS 'Stores detailed audit events for tracking changes and actions in the system';

COMMENT ON COLUMN audit_events.id IS 'Primary key';

COMMENT ON COLUMN audit_events.date IS 'Timestamp when the audit event occurred';

COMMENT ON COLUMN audit_events.action IS 'The type of action performed (e.g., insert, update, delete)';

COMMENT ON COLUMN audit_events.action_detail IS 'Additional details about the action (e.g. type of update)';

COMMENT ON COLUMN audit_events.table_name IS 'Name of the table that was affected';

COMMENT ON COLUMN audit_events.agent_authn_user_id IS 'ID of the authenticated user who performed the action';

COMMENT ON COLUMN audit_events.agent_user_id IS 'ID of the user who performed the action';

COMMENT ON COLUMN audit_events.context IS 'Additional context about the event';

COMMENT ON COLUMN audit_events.old_row IS 'Previous state of the row';

COMMENT ON COLUMN audit_events.new_row IS 'New state of the row';

COMMENT ON COLUMN audit_events.row_id IS 'Primary key of the affected row';
