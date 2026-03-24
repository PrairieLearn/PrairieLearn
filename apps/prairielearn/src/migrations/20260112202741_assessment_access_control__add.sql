-- Enum for access control target types
CREATE TYPE enum_assessment_access_control_target_type AS ENUM('none', 'enrollment', 'student_label');

-- Main access control rules table
CREATE TABLE assessment_access_control_rules (
  id BIGSERIAL PRIMARY KEY,
  assessment_id BIGINT NOT NULL REFERENCES assessments (id) ON DELETE CASCADE ON UPDATE CASCADE,
  list_before_release boolean,
  -- `number` is unique per (assessment_id, target_type), not per assessment.
  -- number=0 is always the main rule (target_type='none'), while override rules
  -- (target_type='enrollment' or 'student_label') start numbering from 1 independently.
  number INTEGER NOT NULL,
  -- Target type: 'none' for main rule (applies to all), 'enrollment' for individual students, 'student_label' for student labels
  target_type enum_assessment_access_control_target_type NOT NULL,
  date_control_release_date_overridden boolean NOT NULL DEFAULT false,
  date_control_release_date TIMESTAMP WITH TIME ZONE,
  date_control_due_date_overridden boolean NOT NULL DEFAULT false,
  date_control_due_date TIMESTAMP WITH TIME ZONE,
  date_control_early_deadlines_overridden boolean NOT NULL DEFAULT false,
  date_control_late_deadlines_overridden boolean NOT NULL DEFAULT false,
  date_control_after_last_deadline_allow_submissions boolean,
  date_control_after_last_deadline_credit_overridden boolean NOT NULL DEFAULT false,
  date_control_after_last_deadline_credit int CHECK (date_control_after_last_deadline_credit >= 0),
  date_control_duration_minutes_overridden boolean NOT NULL DEFAULT false,
  date_control_duration_minutes int CHECK (date_control_duration_minutes > 0),
  date_control_password_overridden boolean NOT NULL DEFAULT false,
  date_control_password text,
  -- after_complete_hide_questions and after_complete_hide_score use nullable
  -- boolean instead of a separate _overridden column: NULL = inherit from
  -- parent rule, true/false = explicitly set. This works because booleans
  -- only need two explicit values, unlike timestamps/integers which need
  -- _overridden to distinguish "inherit" from "explicitly set to NULL".
  after_complete_hide_questions boolean,
  after_complete_show_questions_again_date_overridden boolean NOT NULL DEFAULT false,
  after_complete_show_questions_again_date TIMESTAMP WITH TIME ZONE,
  after_complete_hide_questions_again_date_overridden boolean NOT NULL DEFAULT false,
  after_complete_hide_questions_again_date TIMESTAMP WITH TIME ZONE,
  after_complete_hide_score boolean,
  after_complete_show_score_again_date_overridden boolean NOT NULL DEFAULT false,
  after_complete_show_score_again_date TIMESTAMP WITH TIME ZONE,
  CONSTRAINT aacr_assessment_number_target_type_unique UNIQUE (assessment_id, number, target_type)
);

-- Unique index on (id, target_type) is needed so child tables can use a composite
-- foreign key (assessment_access_control_rule_id, target_type) that enforces data consistency:
-- it guarantees that a child row (e.g. in _enrollments) can only reference a parent row
-- whose target_type matches (e.g. 'enrollment'), preventing linking an enrollment target
-- to a rule with target_type='student_label' or 'none'.
CREATE UNIQUE INDEX assessment_access_control_rules_id_target_type_idx ON assessment_access_control_rules (id, target_type);

-- Enforce bidirectional relationship: number=0 ⟺ target_type='none'
ALTER TABLE assessment_access_control_rules
ADD CONSTRAINT check_first_rule_is_none CHECK ((number = 0) = (target_type = 'none'));

-- Enrollment targeting table (links access control rules to individual students)
CREATE TABLE assessment_access_control_enrollments (
  id BIGSERIAL PRIMARY KEY,
  assessment_access_control_rule_id BIGINT NOT NULL,
  -- Constant column to enforce that parent has target_type = 'enrollment'
  target_type enum_assessment_access_control_target_type NOT NULL DEFAULT 'enrollment' CHECK (target_type = 'enrollment'),
  enrollment_id BIGINT NOT NULL REFERENCES enrollments (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT aac_enrollments_rule_id_enrollment_id_unique UNIQUE (assessment_access_control_rule_id, enrollment_id),
  CONSTRAINT aac_enrollments_rule_id_target_type_fkey FOREIGN KEY (assessment_access_control_rule_id, target_type) REFERENCES assessment_access_control_rules (id, target_type) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX aac_enrollments_rule_id_idx ON assessment_access_control_enrollments (assessment_access_control_rule_id);

CREATE INDEX aac_enrollments_enrollment_id_idx ON assessment_access_control_enrollments (enrollment_id);

-- Student label targeting table (links access control rules to student labels)
CREATE TABLE assessment_access_control_student_labels (
  id BIGSERIAL PRIMARY KEY,
  assessment_access_control_rule_id BIGINT NOT NULL,
  -- Constant column to enforce that parent has target_type = 'student_label'
  target_type enum_assessment_access_control_target_type NOT NULL DEFAULT 'student_label' CHECK (target_type = 'student_label'),
  student_label_id BIGINT NOT NULL REFERENCES student_labels (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT aac_student_labels_rule_id_student_label_id_unique UNIQUE (
    assessment_access_control_rule_id,
    student_label_id
  ),
  CONSTRAINT aac_student_labels_rule_id_target_type_fkey FOREIGN KEY (assessment_access_control_rule_id, target_type) REFERENCES assessment_access_control_rules (id, target_type) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX aac_student_labels_rule_id_idx ON assessment_access_control_student_labels (assessment_access_control_rule_id);

CREATE INDEX aac_student_labels_student_label_id_idx ON assessment_access_control_student_labels (student_label_id);

-- Early deadlines table
CREATE TABLE assessment_access_control_early_deadlines (
  id BIGSERIAL PRIMARY KEY,
  assessment_access_control_rule_id BIGINT NOT NULL,
  date TIMESTAMP WITH TIME ZONE NOT NULL,
  credit INT NOT NULL CHECK (credit >= 0),
  CONSTRAINT aac_early_deadlines_rule_id_date_unique UNIQUE (assessment_access_control_rule_id, date),
  CONSTRAINT aac_early_deadlines_rule_id_fkey FOREIGN KEY (assessment_access_control_rule_id) REFERENCES assessment_access_control_rules (id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX aac_early_deadlines_rule_id_idx ON assessment_access_control_early_deadlines (assessment_access_control_rule_id);

-- Late deadlines table
CREATE TABLE assessment_access_control_late_deadlines (
  id BIGSERIAL PRIMARY KEY,
  assessment_access_control_rule_id BIGINT NOT NULL,
  date TIMESTAMP WITH TIME ZONE NOT NULL,
  credit INT NOT NULL CHECK (credit >= 0),
  CONSTRAINT aac_late_deadlines_rule_id_date_unique UNIQUE (assessment_access_control_rule_id, date),
  CONSTRAINT aac_late_deadlines_rule_id_fkey FOREIGN KEY (assessment_access_control_rule_id) REFERENCES assessment_access_control_rules (id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX aac_late_deadlines_rule_id_idx ON assessment_access_control_late_deadlines (assessment_access_control_rule_id);

-- PrairieTest exams table
CREATE TABLE assessment_access_control_prairietest_exams (
  id BIGSERIAL PRIMARY KEY,
  assessment_access_control_rule_id BIGINT NOT NULL,
  uuid uuid NOT NULL,
  read_only boolean NOT NULL DEFAULT false,
  CONSTRAINT aac_prairietest_exams_rule_id_uuid_unique UNIQUE (assessment_access_control_rule_id, uuid),
  CONSTRAINT aac_prairietest_exams_rule_id_fkey FOREIGN KEY (assessment_access_control_rule_id) REFERENCES assessment_access_control_rules (id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX aac_prairietest_exams_rule_id_idx ON assessment_access_control_prairietest_exams (assessment_access_control_rule_id);
