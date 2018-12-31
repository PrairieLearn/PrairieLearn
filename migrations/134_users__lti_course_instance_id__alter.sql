ALTER TABLE users
    DROP CONSTRAINT users_lti_course_instance_id_fkey,
    ADD CONSTRAINT users_lti_course_instance_id_fkey
        FOREIGN KEY (lti_course_instance_id)
        REFERENCES course_instances(id)
	ON DELETE SET NULL
	ON UPDATE CASCADE;
