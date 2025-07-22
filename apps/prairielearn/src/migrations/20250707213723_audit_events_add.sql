CREATE TYPE audit_event_action AS ENUM ('insert', 'update', 'delete');

CREATE TABLE audit_events (
  id BIGSERIAL PRIMARY KEY,
  date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  action audit_event_action NOT NULL,
  action_detail TEXT,
  table_name TEXT NOT NULL,
  agent_authn_user_id BIGINT,
  agent_user_id BIGINT,
  institution_id BIGINT,
  course_id BIGINT,
  course_instance_id BIGINT,
  assessment_id BIGINT,
  assessment_instance_id BIGINT,
  assessment_question_id BIGINT,
  group_id BIGINT,
  subject_user_id BIGINT,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  old_row JSONB,
  new_row JSONB,
  row_id BIGINT NOT NULL,
  CONSTRAINT audit_events_agent_authn_user_id_fkey FOREIGN KEY (agent_authn_user_id) REFERENCES users (user_id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT audit_events_agent_user_id_fkey FOREIGN KEY (agent_user_id) REFERENCES users (user_id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT audit_events_course_id_fkey FOREIGN KEY (course_id) REFERENCES pl_courses (id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT audit_events_course_instance_id_fkey FOREIGN KEY (course_instance_id) REFERENCES course_instances (id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT audit_events_group_id_fkey FOREIGN KEY (group_id) REFERENCES groups (id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT audit_events_subject_user_id_fkey FOREIGN KEY (subject_user_id) REFERENCES users (user_id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT audit_events_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES institutions (id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT audit_events_assessment_id_fkey FOREIGN KEY (assessment_id) REFERENCES assessments (id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT audit_events_assessment_instance_id_fkey FOREIGN KEY (assessment_instance_id) REFERENCES assessment_instances (id) ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT audit_events_assessment_question_id_fkey FOREIGN KEY (assessment_question_id) REFERENCES assessment_questions (id) ON UPDATE CASCADE ON DELETE SET NULL
);

-- These columns could be hard-deleted; this index helps us prune old events quickly.
CREATE INDEX audit_events_assessment_instance_id_idx ON audit_events (assessment_instance_id);
CREATE INDEX audit_events_institution_id_idx ON audit_events (institution_id);

-- Events that affect a user
CREATE INDEX audit_events_subject_user_id_idx ON audit_events (subject_user_id) WHERE subject_user_id IS NOT NULL;

-- Specific types of events that affect a user
CREATE INDEX audit_events_table_name_subject_user_id_idx ON audit_events (table_name, subject_user_id) WHERE subject_user_id IS NOT NULL;

-- Specific types of events that affect a user in a course instance
CREATE INDEX audit_events_table_name_subject_user_id_course_instance_id_idx ON audit_events (table_name, subject_user_id, course_instance_id) WHERE subject_user_id IS NOT NULL AND course_instance_id IS NOT NULL;

-- Events caused by a user
CREATE INDEX audit_events_agent_authn_user_id_idx ON audit_events (agent_authn_user_id) WHERE agent_authn_user_id IS NOT NULL;

-- Specific types of events caused by a user
CREATE INDEX audit_events_agent_authn_user_id_table_name_idx ON audit_events (agent_authn_user_id, table_name) WHERE agent_authn_user_id IS NOT NULL;

-- Specific types of events caused by a user in a course instance
CREATE INDEX audit_events_agent_authn_user_id_course_instance_id_idx ON audit_events (agent_authn_user_id, course_instance_id) WHERE agent_authn_user_id IS NOT NULL AND course_instance_id IS NOT NULL;