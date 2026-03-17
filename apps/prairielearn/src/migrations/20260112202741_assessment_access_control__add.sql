-- Enum for access control target types
CREATE TYPE enum_assessment_access_control_target_type AS ENUM('none', 'enrollment', 'student_label');

-- Main access control rules table
CREATE TABLE assessment_access_control (
  id BIGSERIAL PRIMARY KEY,
  course_instance_id BIGINT NOT NULL REFERENCES course_instances (id) ON DELETE CASCADE ON UPDATE CASCADE,
  assessment_id BIGINT NOT NULL REFERENCES assessments (id) ON DELETE CASCADE ON UPDATE CASCADE,
  enabled boolean,
  block_access boolean,
  list_before_release boolean,
  number INTEGER NOT NULL,
  -- Target type: 'none' for main rule (applies to all), 'enrollment' for individual students, 'student_label' for student labels
  target_type enum_assessment_access_control_target_type NOT NULL,
  date_control_overridden boolean NOT NULL DEFAULT false,
  date_control_release_date_overridden boolean NOT NULL DEFAULT false,
  date_control_release_date TIMESTAMP WITH TIME ZONE,
  date_control_due_date_overridden boolean NOT NULL DEFAULT false,
  date_control_due_date TIMESTAMP WITH TIME ZONE,
  date_control_early_deadlines_overridden boolean NOT NULL DEFAULT false,
  date_control_late_deadlines_overridden boolean NOT NULL DEFAULT false,
  date_control_after_last_deadline_allow_submissions boolean,
  date_control_after_last_deadline_credit_overridden boolean NOT NULL DEFAULT false,
  date_control_after_last_deadline_credit int,
  date_control_duration_minutes_overridden boolean NOT NULL DEFAULT false,
  date_control_duration_minutes int,
  date_control_password_overridden boolean NOT NULL DEFAULT false,
  date_control_password text,
  integrations_prairietest_overridden boolean NOT NULL DEFAULT false,
  after_complete_hide_questions boolean,
  after_complete_show_questions_again_date_overridden boolean NOT NULL DEFAULT false,
  after_complete_show_questions_again_date TIMESTAMP WITH TIME ZONE,
  after_complete_hide_questions_again_date_overridden boolean NOT NULL DEFAULT false,
  after_complete_hide_questions_again_date TIMESTAMP WITH TIME ZONE,
  after_complete_hide_score boolean,
  after_complete_show_score_again_date_overridden boolean NOT NULL DEFAULT false,
  after_complete_show_score_again_date TIMESTAMP WITH TIME ZONE,
  CONSTRAINT aac_ci_assessment_number_target_type_unique UNIQUE (
    course_instance_id,
    assessment_id,
    number,
    target_type
  )
);

-- Unique index on (id, target_type) is needed so child tables can use a composite
-- foreign key (assessment_access_control_id, target_type) that enforces data consistency:
-- it guarantees that a child row (e.g. in _enrollments) can only reference a parent row
-- whose target_type matches (e.g. 'enrollment'), preventing linking an enrollment target
-- to a rule with target_type='student_label' or 'none'.
CREATE UNIQUE INDEX assessment_access_control_id_target_type_idx ON assessment_access_control (id, target_type);

-- Enforce bidirectional relationship: number=0 ⟺ target_type='none'
ALTER TABLE assessment_access_control
ADD CONSTRAINT check_first_rule_is_none CHECK ((number = 0) = (target_type = 'none'));

-- Enrollment targeting table (links access control rules to individual students)
CREATE TABLE assessment_access_control_enrollments (
  id BIGSERIAL PRIMARY KEY,
  assessment_access_control_id BIGINT NOT NULL,
  -- Constant column to enforce that parent has target_type = 'enrollment'
  target_type enum_assessment_access_control_target_type NOT NULL DEFAULT 'enrollment' CHECK (target_type = 'enrollment'),
  enrollment_id BIGINT NOT NULL REFERENCES enrollments (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT aac_enrollments_aac_id_enrollment_id_unique UNIQUE (assessment_access_control_id, enrollment_id),
  CONSTRAINT aac_enrollments_aac_id_target_type_fkey FOREIGN KEY (assessment_access_control_id, target_type) REFERENCES assessment_access_control (id, target_type) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX aac_enrollments_aac_id_idx ON assessment_access_control_enrollments (assessment_access_control_id);

CREATE INDEX aac_enrollments_enrollment_id_idx ON assessment_access_control_enrollments (enrollment_id);

-- Student label targeting table (links access control rules to student labels)
CREATE TABLE assessment_access_control_student_labels (
  id BIGSERIAL PRIMARY KEY,
  assessment_access_control_id BIGINT NOT NULL,
  -- Constant column to enforce that parent has target_type = 'student_label'
  target_type enum_assessment_access_control_target_type NOT NULL DEFAULT 'student_label' CHECK (target_type = 'student_label'),
  student_label_id BIGINT NOT NULL REFERENCES student_labels (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT aac_student_labels_aac_id_student_label_id_unique UNIQUE (assessment_access_control_id, student_label_id),
  CONSTRAINT aac_student_labels_aac_id_target_type_fkey FOREIGN KEY (assessment_access_control_id, target_type) REFERENCES assessment_access_control (id, target_type) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX aac_student_labels_aac_id_idx ON assessment_access_control_student_labels (assessment_access_control_id);

CREATE INDEX aac_student_labels_student_label_id_idx ON assessment_access_control_student_labels (student_label_id);

-- Early deadline table
CREATE TABLE assessment_access_control_early_deadline (
  id BIGSERIAL PRIMARY KEY,
  assessment_access_control_id BIGINT NOT NULL,
  date TIMESTAMP WITH TIME ZONE NOT NULL,
  credit INT NOT NULL,
  sort_order INTEGER NOT NULL,
  CONSTRAINT aac_early_deadline_aac_id_fkey FOREIGN KEY (assessment_access_control_id) REFERENCES assessment_access_control (id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX aac_early_deadline_aac_id_idx ON assessment_access_control_early_deadline (assessment_access_control_id);

-- Late deadline table
CREATE TABLE assessment_access_control_late_deadline (
  id BIGSERIAL PRIMARY KEY,
  assessment_access_control_id BIGINT NOT NULL,
  date TIMESTAMP WITH TIME ZONE NOT NULL,
  credit INT NOT NULL,
  sort_order INTEGER NOT NULL,
  CONSTRAINT aac_late_deadline_aac_id_fkey FOREIGN KEY (assessment_access_control_id) REFERENCES assessment_access_control (id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX aac_late_deadline_aac_id_idx ON assessment_access_control_late_deadline (assessment_access_control_id);

-- PrairieTest exam table
CREATE TABLE assessment_access_control_prairietest_exam (
  id BIGSERIAL PRIMARY KEY,
  assessment_access_control_id BIGINT NOT NULL,
  uuid uuid NOT NULL,
  read_only boolean,
  CONSTRAINT aac_prairietest_exam_aac_id_fkey FOREIGN KEY (assessment_access_control_id) REFERENCES assessment_access_control (id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX aac_prairietest_exam_aac_id_idx ON assessment_access_control_prairietest_exam (assessment_access_control_id);
