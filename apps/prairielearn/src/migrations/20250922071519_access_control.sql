CREATE TYPE permission_scope AS ENUM('assessment', 'group', 'individual');

-- Role 1-1 Permission
CREATE TABLE IF NOT EXISTS access_control (
  id BIGSERIAL PRIMARY KEY,
  course_instance_id BIGINT NOT NULL REFERENCES course_instances (id) ON DELETE CASCADE ON UPDATE CASCADE,
  assessment_id BIGINT NOT NULL REFERENCES assessments (id) ON DELETE CASCADE ON UPDATE CASCADE, --  which assessment to apply this to
  enabled boolean,
  block_access boolean,
  list_before_release boolean,
  "order" INTEGER, -- precedence, lower is higher priority
  -- dateControl fields
  date_control_overridden boolean,
  date_control_release_date_overridden boolean,
  date_control_release_date TIMESTAMP WITH TIME ZONE,
  date_control_due_date_overridden boolean,
  date_control_due_date TIMESTAMP WITH TIME ZONE,
  date_control_early_deadlines_overridden boolean,
  date_control_late_deadlines_overridden boolean,
  date_control_after_last_deadline_allow_submissions boolean,
  date_control_after_last_deadline_credit_overridden boolean,
  date_control_after_last_deadline_credit int,
  date_control_duration_minutes_overridden boolean,
  date_control_duration_minutes int,
  date_control_password_overridden boolean,
  date_control_password text,
  prairietest_control_overridden boolean,
  -- afterComplete fields
  after_complete_hide_questions boolean,
  after_complete_hide_questions_show_again_date_overridden boolean,
  after_complete_hide_questions_show_again_date TIMESTAMP WITH TIME ZONE,
  after_complete_hide_questions_hide_again_date_overridden boolean,
  after_complete_hide_questions_hide_again_date TIMESTAMP WITH TIME ZONE,
  after_complete_hide_score boolean,
  after_complete_hide_score_show_again_date_overridden boolean,
  after_complete_hide_score_show_again_date TIMESTAMP WITH TIME ZONE,
  UNIQUE(course_instance_id, assessment_id, "order") DEFERRABLE INITIALLY IMMEDIATE -- we allow for this to be deferred as reordering rules can cause temporary 
);

CREATE TABLE IF NOT EXISTS access_control_groups (
  id BIGSERIAL PRIMARY KEY,
  uuid uuid,
  name text,
  description text,
  course_instance_id BIGINT NOT NULL REFERENCES course_instances (id) ON DELETE CASCADE ON UPDATE CASCADE,
  UNIQUE (course_instance_id, uuid) 
);

CREATE INDEX idx_sections_on_course_instance_id ON access_control_groups (course_instance_id);

CREATE TABLE IF NOT EXISTS access_control_group_member (
  id BIGSERIAL PRIMARY KEY,
  group_id BIGINT NOT NULL REFERENCES access_control_groups (id) ON DELETE CASCADE ON UPDATE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users (user_id) ON DELETE CASCADE ON UPDATE CASCADE,
  UNIQUE (group_id, user_id)
);

CREATE TABLE IF NOT EXISTS access_control_target (
  id BIGSERIAL PRIMARY KEY,
  access_control_id BIGINT NOT NULL REFERENCES access_control (id) ON DELETE CASCADE ON UPDATE CASCADE,
  target_type permission_scope NOT NULL,
  target_id BIGINT NOT NULL -- assessments(id), Group(id), users(user_id)
);

CREATE INDEX idx_rolepermission_lookup ON access_control_target (access_control_id, target_type);

CREATE TABLE IF NOT EXISTS access_control_early_deadline (
  id BIGSERIAL PRIMARY KEY,
  access_control_id BIGINT NOT NULL REFERENCES access_control (id) ON DELETE CASCADE ON UPDATE CASCADE,
  date TIMESTAMP WITH TIME ZONE NOT NULL,
  credit INT NOT NULL
);

CREATE TABLE IF NOT EXISTS access_control_late_deadline (
  id BIGSERIAL PRIMARY KEY,
  access_control_id BIGINT NOT NULL REFERENCES access_control (id) ON DELETE CASCADE ON UPDATE CASCADE,
  date TIMESTAMP WITH TIME ZONE NOT NULL,
  credit INT NOT NULL
);

CREATE TABLE IF NOT EXISTS access_control_prairietest_exam (
  id BIGSERIAL PRIMARY KEY,
  access_control_id BIGINT NOT NULL REFERENCES access_control (id) ON DELETE CASCADE ON UPDATE CASCADE,
  exam_id BIGINT NOT NULL REFERENCES exams (exam_id) ON DELETE CASCADE ON UPDATE CASCADE,
  read_only boolean
);
