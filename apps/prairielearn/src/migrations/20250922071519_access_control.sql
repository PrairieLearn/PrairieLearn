CREATE TYPE permission_scope AS ENUM (
	'assessment',
	'group',
	'individual'
);

-- Role 1-1 Permission
CREATE TABLE IF NOT EXISTS access_control (
	id BIGSERIAL PRIMARY KEY,
	course_instance_id BIGINT NOT NULL REFERENCES course_instances(id) ON DELETE CASCADE ON UPDATE CASCADE,
	assessment_id BIGINT NOT NULL REFERENCES assessments(id) ON DELETE CASCADE ON UPDATE CASCADE, --  which assessment to apply this to
	enabled boolean,
	blockAcesss boolean,
	listBeforeRelease boolean,

	-- dateControl fields
	date_control_enabled boolean,
	date_control_release_date_enabled boolean,
	date_control_release_date TIMESTAMP WITH TIME ZONE,
	
	date_control_due_date_enabled boolean,
	date_control_due_date TIMESTAMP WITH TIME ZONE,

	date_control_early_deadlines_enabled boolean,
	-- earlyDeadlines stored in AccessControlEarlyDeadlines join table
	date_control_late_deadlines_enabled boolean,
	-- earlyDeadlines stored in AccessControlLateDeadlines join table

	-- if date_control_afterLastDeadline_allowSubmissions is true, afterComplete will never apply
	date_control_after_last_deadline_allow_submissions boolean,
    date_control_after_last_deadline_credit_enable boolean,
    date_control_after_last_deadline_credit int,

    date_control_duration_minutes_enabled boolean,
    date_control_duration_minutes int,
    date_control_password_enabled boolean,
    date_control_password text,

    prairieTestControl_enable boolean,

    after_complete_hide_questions_before_date_enabled boolean,
    after_complete_hide_questions_before_date TIMESTAMP WITH TIME ZONE,
    after_complete_hide_questions_after_date_enabled boolean,
    after_complete_hide_questions_after_date TIMESTAMP WITH TIME ZONE, /* can only be set if beforeDate is set (UI limitation) */
    after_complete_hideScore_before_date_enabled boolean,
    after_complete_hideScore_before_date TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS access_control_groups (
	id BIGSERIAL PRIMARY KEY,
	name text,
	description text,
	course_instance_id BIGINT NOT NULL REFERENCES course_instances(id) ON DELETE CASCADE ON UPDATE CASCADE,
	UNIQUE (course_instance_id, id)
);

CREATE INDEX idx_sections_on_course_instance_id ON access_control_groups(course_instance_id);

CREATE TABLE IF NOT EXISTS access_control_group_members (
	group_id BIGINT NOT NULL REFERENCES access_control_groups(id) ON DELETE CASCADE ON UPDATE CASCADE,
	user_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS role_targets (
	roles_id BIGINT NOT NULL REFERENCES access_control(id) ON DELETE CASCADE ON UPDATE CASCADE,
	target_type permission_scope NOT NULL,
	target_id BIGINT NOT NULL -- assessments(id), Group(id), users(user_id)
);
CREATE INDEX idx_rolepermission_lookup ON role_targets (roles_id, target_type);

CREATE TABLE IF NOT EXISTS access_control_early_deadlines (
	role_id BIGINT NOT NULL,
    date TIMESTAMP WITH TIME ZONE NOT NULL,
    credit int NOT NULL
);

CREATE TABLE IF NOT EXISTS access_control_late_deadlines (
	role_id BIGINT NOT NULL,
    date TIMESTAMP WITH TIME ZONE NOT NULL,
    credit int NOT NULL	
);

CREATE TABLE IF NOT EXISTS access_control_prairietest_exams (
	role_id BIGINT NOT NULL,
    exam_id BIGINT NOT NULL REFERENCES exams(exam_id) ON DELETE CASCADE ON UPDATE CASCADE,
    read_only boolean	
);
