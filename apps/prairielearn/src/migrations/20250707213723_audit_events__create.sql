CREATE TYPE audit_event_action AS ENUM('insert', 'update', 'delete');

-- As a general rule, we'll use foreign-key constraints for tables that are soft-deleted
-- and avoid them for tables that are hard-deleted. See inline comments below for more
-- details and exceptions to this rule.
CREATE TABLE audit_events (
  id BIGSERIAL PRIMARY KEY,
  date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  action audit_event_action NOT NULL,
  action_detail TEXT,
  table_name TEXT NOT NULL,
  agent_authn_user_id BIGINT REFERENCES users (user_id) ON UPDATE CASCADE ON DELETE SET NULL,
  agent_user_id BIGINT REFERENCES users (user_id) ON UPDATE CASCADE ON DELETE SET NULL,
  -- Institutions can be hard deleted, but basically never actually should be,
  -- so we'll use a proper foreign key constraint.
  institution_id BIGINT REFERENCES institutions (id) ON UPDATE CASCADE ON DELETE SET NULL,
  course_id BIGINT REFERENCES pl_courses (id) ON UPDATE CASCADE ON DELETE SET NULL,
  course_instance_id BIGINT REFERENCES course_instances (id) ON UPDATE CASCADE ON DELETE SET NULL,
  assessment_id BIGINT REFERENCES assessments (id) ON UPDATE CASCADE ON DELETE SET NULL,
  -- Assessment instance rows are currently hard-deleted. We won't use a foreign key
  -- constraint for two reasons:
  -- - We want to avoid either table scans or a dedicated index.
  -- - We don't want the deletion of an assessment instance to also delete the logs,
  --   and we also don't want to null out the `assessment_instance_id` if the instance
  --   is deleted.
  -- More context: https://github.com/PrairieLearn/PrairieLearn/pull/12362#discussion_r2226445050
  assessment_instance_id BIGINT,
  assessment_question_id BIGINT REFERENCES assessment_questions (id) ON UPDATE CASCADE ON DELETE SET NULL,
  group_id BIGINT REFERENCES groups (id) ON UPDATE CASCADE ON DELETE SET NULL,
  subject_user_id BIGINT REFERENCES users (user_id) ON UPDATE CASCADE ON DELETE SET NULL,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  old_row JSONB,
  new_row JSONB,
  row_id BIGINT NOT NULL
);

-- Events that affect a user (potentially on specific tables) (potentially in a course instance)
CREATE INDEX audit_events_table_name_subject_user_id_course_instance_id_idx ON audit_events (subject_user_id, table_name, course_instance_id)
WHERE
  subject_user_id IS NOT NULL;

-- Events caused by a user (potentially on specific tables) (potentially in a course instance)
CREATE INDEX audit_events_agent_authn_user_id_course_instance_id_idx ON audit_events (
  agent_authn_user_id,
  table_name,
  course_instance_id
)
WHERE
  agent_authn_user_id IS NOT NULL;
