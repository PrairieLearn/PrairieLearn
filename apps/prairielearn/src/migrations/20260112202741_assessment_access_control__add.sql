-- Drop tables if they exist (to handle partial migration state)
DROP TABLE IF EXISTS assessment_access_control_prairietest_exam CASCADE;

DROP TABLE IF EXISTS assessment_access_control_late_deadline CASCADE;

DROP TABLE IF EXISTS assessment_access_control_early_deadline CASCADE;

DROP TABLE IF EXISTS assessment_access_control_student_labels CASCADE;

DROP TABLE IF EXISTS assessment_access_control_enrollments CASCADE;

DROP TABLE IF EXISTS assessment_access_control CASCADE;

-- Main access control rules table
CREATE TABLE assessment_access_control (
  id BIGSERIAL PRIMARY KEY,
  course_instance_id BIGINT NOT NULL REFERENCES course_instances (id) ON DELETE CASCADE ON UPDATE CASCADE,
  assessment_id BIGINT NOT NULL REFERENCES assessments (id) ON DELETE CASCADE ON UPDATE CASCADE,
  enabled boolean,
  block_access boolean,
  list_before_release boolean,
  number INTEGER,
  -- Target type: 'none' for main rule (applies to all), 'enrollment' for individual students, 'student_label' for groups
  target_type TEXT NOT NULL CHECK (
    target_type IN ('none', 'enrollment', 'student_label')
  ),
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
  after_complete_hide_questions boolean,
  after_complete_show_questions_again_date_overridden boolean,
  after_complete_show_questions_again_date TIMESTAMP WITH TIME ZONE,
  after_complete_hide_questions_again_date_overridden boolean,
  after_complete_hide_questions_again_date TIMESTAMP WITH TIME ZONE,
  after_complete_hide_score boolean,
  after_complete_show_score_again_date_overridden boolean,
  after_complete_show_score_again_date TIMESTAMP WITH TIME ZONE,
  CONSTRAINT aac_ci_assessment_number_target_type_unique UNIQUE (
    course_instance_id,
    assessment_id,
    number,
    target_type
  )
);

-- Unique constraint needed for composite foreign key from child tables
CREATE UNIQUE INDEX assessment_access_control_id_target_type_idx ON assessment_access_control (id, target_type);

-- Enforce bidirectional relationship: number=0 ⟺ target_type='none'
ALTER TABLE assessment_access_control
ADD CONSTRAINT check_first_rule_is_none CHECK ((number = 0) = (target_type = 'none'));

-- Enrollment targeting table (links access control rules to individual students)
CREATE TABLE assessment_access_control_enrollments (
  id BIGSERIAL PRIMARY KEY,
  assessment_access_control_id BIGINT NOT NULL,
  -- Constant column to enforce that parent has target_type = 'enrollment'
  target_type TEXT NOT NULL DEFAULT 'enrollment' CHECK (target_type = 'enrollment'),
  enrollment_id BIGINT NOT NULL REFERENCES enrollments (id) ON DELETE CASCADE ON UPDATE CASCADE,
  UNIQUE (assessment_access_control_id, enrollment_id),
  FOREIGN KEY (assessment_access_control_id, target_type) REFERENCES assessment_access_control (id, target_type) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX assessment_access_control_enrollments_aac_id_idx ON assessment_access_control_enrollments (assessment_access_control_id);

CREATE INDEX assessment_access_control_enrollments_enrollment_id_idx ON assessment_access_control_enrollments (enrollment_id);

-- Student group targeting table (links access control rules to student groups)
CREATE TABLE assessment_access_control_student_labels (
  id BIGSERIAL PRIMARY KEY,
  assessment_access_control_id BIGINT NOT NULL,
  -- Constant column to enforce that parent has target_type = 'student_label'
  target_type TEXT NOT NULL DEFAULT 'student_label' CHECK (target_type = 'student_label'),
  student_label_id BIGINT NOT NULL REFERENCES student_labels (id) ON DELETE CASCADE ON UPDATE CASCADE,
  UNIQUE (assessment_access_control_id, student_label_id),
  FOREIGN KEY (assessment_access_control_id, target_type) REFERENCES assessment_access_control (id, target_type) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX assessment_access_control_student_labels_aac_id_idx ON assessment_access_control_student_labels (assessment_access_control_id);

CREATE INDEX assessment_access_control_student_labels_sg_id_idx ON assessment_access_control_student_labels (student_label_id);

-- Early deadline table
CREATE TABLE assessment_access_control_early_deadline (
  id BIGSERIAL PRIMARY KEY,
  access_control_id BIGINT NOT NULL REFERENCES assessment_access_control (id) ON DELETE CASCADE ON UPDATE CASCADE,
  date TIMESTAMP WITH TIME ZONE NOT NULL,
  credit INT NOT NULL
);

-- Late deadline table
CREATE TABLE assessment_access_control_late_deadline (
  id BIGSERIAL PRIMARY KEY,
  access_control_id BIGINT NOT NULL REFERENCES assessment_access_control (id) ON DELETE CASCADE ON UPDATE CASCADE,
  date TIMESTAMP WITH TIME ZONE NOT NULL,
  credit INT NOT NULL
);

-- PrairieTest exam table
CREATE TABLE assessment_access_control_prairietest_exam (
  id BIGSERIAL PRIMARY KEY,
  access_control_id BIGINT NOT NULL REFERENCES assessment_access_control (id) ON DELETE CASCADE ON UPDATE CASCADE,
  uuid uuid NOT NULL,
  read_only boolean
);
