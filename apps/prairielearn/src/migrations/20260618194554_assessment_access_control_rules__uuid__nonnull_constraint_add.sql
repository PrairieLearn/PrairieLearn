ALTER TABLE assessment_access_control_rules
ADD CONSTRAINT assessment_access_control_rules_uuid_target_type_check CHECK ((target_type = 'none') = (uuid IS NULL)) NOT VALID;
