-- The replacement index was built concurrently, so this swap does not rebuild or scan it.
ALTER TABLE assessment_access_control_prairietest_exams
DROP CONSTRAINT aac_prairietest_exams_rule_id_uuid_unique,
-- squawk-ignore constraint-missing-not-valid, disallowed-unique-constraint
ADD CONSTRAINT aac_prairietest_exams_uuid_rule_id_unique UNIQUE USING INDEX aac_prairietest_exams_uuid_rule_id_idx;
