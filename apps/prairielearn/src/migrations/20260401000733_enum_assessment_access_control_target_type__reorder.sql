-- Reorder enum values so that 'student_label' comes before 'enrollment',
-- matching the evaluation order.
--
-- PostgreSQL doesn't support reordering enum values, so we rename the old
-- enum, create a new one with the correct order, migrate the columns, and
-- drop the old enum.
ALTER TYPE enum_assessment_access_control_target_type
RENAME TO enum_assessment_access_control_target_type_old;

CREATE TYPE enum_assessment_access_control_target_type AS ENUM('none', 'student_label', 'enrollment');

-- Migrate all columns that use this enum.
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
