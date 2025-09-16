ALTER TABLE lti13_users
-- squawk-ignore constraint-missing-not-valid, disallowed-unique-constraint
ADD CONSTRAINT lti13_users_lti13_instance_id_sub_key UNIQUE (lti13_instance_id, sub);
