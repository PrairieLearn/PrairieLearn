-- Reorder enum values so that 'student_label' comes before 'enrollment',
-- matching the evaluation order.
--
-- PostgreSQL doesn't support reordering enum values, so we rename the old
-- enum, create a new one with the correct order, migrate the columns, and
-- drop the old enum.
--
-- We must drop all check constraints, defaults, and foreign keys that
-- reference the old enum type before changing column types, then re-add
-- them afterward.
ALTER TYPE enum_assessment_access_control_target_type
RENAME TO enum_assessment_access_control_target_type_old;

CREATE TYPE enum_assessment_access_control_target_type AS ENUM('none', 'student_label', 'enrollment');

-- Drop check constraints that reference the old enum type.
ALTER TABLE assessment_access_control_rules
DROP CONSTRAINT check_first_rule_is_none;

ALTER TABLE assessment_access_control_enrollments
DROP CONSTRAINT assessment_access_control_enrollments_target_type_check;

ALTER TABLE assessment_access_control_student_labels
DROP CONSTRAINT assessment_access_control_student_labels_target_type_check;

-- Drop defaults that reference the old enum type.
ALTER TABLE assessment_access_control_enrollments
ALTER COLUMN target_type
DROP DEFAULT;

ALTER TABLE assessment_access_control_student_labels
ALTER COLUMN target_type
DROP DEFAULT;

-- Drop composite foreign keys that include target_type.
ALTER TABLE assessment_access_control_enrollments
DROP CONSTRAINT aac_enrollments_rule_id_target_type_fkey;

ALTER TABLE assessment_access_control_student_labels
DROP CONSTRAINT aac_student_labels_rule_id_target_type_fkey;

-- Migrate all columns to the new enum type.
ALTER TABLE assessment_access_control_rules
-- squawk-ignore changing-column-type
ALTER COLUMN target_type TYPE enum_assessment_access_control_target_type USING target_type::text::enum_assessment_access_control_target_type;

ALTER TABLE assessment_access_control_enrollments
-- squawk-ignore changing-column-type
ALTER COLUMN target_type TYPE enum_assessment_access_control_target_type USING target_type::text::enum_assessment_access_control_target_type;

ALTER TABLE assessment_access_control_student_labels
-- squawk-ignore changing-column-type
ALTER COLUMN target_type TYPE enum_assessment_access_control_target_type USING target_type::text::enum_assessment_access_control_target_type;

DROP TYPE enum_assessment_access_control_target_type_old;

-- Re-add defaults.
ALTER TABLE assessment_access_control_enrollments
ALTER COLUMN target_type
SET DEFAULT 'enrollment'::enum_assessment_access_control_target_type;

ALTER TABLE assessment_access_control_student_labels
ALTER COLUMN target_type
SET DEFAULT 'student_label'::enum_assessment_access_control_target_type;

-- Re-add check constraints.
ALTER TABLE assessment_access_control_rules
-- squawk-ignore constraint-missing-not-valid
ADD CONSTRAINT check_first_rule_is_none CHECK (
  (number = 0) = (
    target_type = 'none'::enum_assessment_access_control_target_type
  )
);

ALTER TABLE assessment_access_control_enrollments
-- squawk-ignore constraint-missing-not-valid
ADD CONSTRAINT assessment_access_control_enrollments_target_type_check CHECK (
  target_type = 'enrollment'::enum_assessment_access_control_target_type
);

ALTER TABLE assessment_access_control_student_labels
-- squawk-ignore constraint-missing-not-valid
ADD CONSTRAINT assessment_access_control_student_labels_target_type_check CHECK (
  target_type = 'student_label'::enum_assessment_access_control_target_type
);

-- Re-add composite foreign keys.
ALTER TABLE assessment_access_control_enrollments
-- squawk-ignore adding-foreign-key-constraint,constraint-missing-not-valid
ADD CONSTRAINT aac_enrollments_rule_id_target_type_fkey FOREIGN KEY (assessment_access_control_rule_id, target_type) REFERENCES assessment_access_control_rules (id, target_type) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE assessment_access_control_student_labels
-- squawk-ignore adding-foreign-key-constraint,constraint-missing-not-valid
ADD CONSTRAINT aac_student_labels_rule_id_target_type_fkey FOREIGN KEY (assessment_access_control_rule_id, target_type) REFERENCES assessment_access_control_rules (id, target_type) ON UPDATE CASCADE ON DELETE CASCADE;
