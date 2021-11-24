CREATE TABLE IF NOT EXISTS group_roles (
    id BIGSERIAL PRIMARY KEY,
    role_name TEXT NOT NULL,
    assessment_id: BIGINT NOT NULL,
    minimum: INT DEFAULT 0,
    maximum: INT DEFAULT 4,
    can_assign_roles_before: BOOLEAN DEFAULT FALSE,
    can_assign_roles_during: BOOLEAN DEFAULT FALSE,
    can_submit_assessment: BOOLEAN DEFAULT TRUE,
    CONSTRAINT group_roles_assessment_id_fkey
        FOREIGN KEY (assessment_id)
            REFERENCES assessments(id) ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE UNIQUE INDEX group_roles_assessment_id_number_key ON group_roles (assessment_id);

CREATE TABLE IF NOT EXISTS assessment_question_role_permissions (
    assessment_question_id: BIGINT NOT NULL,
    group_role_id: BIGINT NOT NULL,
    can_view: BOOLEAN,
    can_submit: BOOLEAN,
    PRIMARY KEY (assessment_question_id, group_role_id),
    CONSTRAINT assessment_question_role_permissions_assessment_question_id_fkey
        FOREIGN KEY (assessment_question_id)
            REFERENCES assessment_questions(id) ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT assessment_question_role_permissions_group_role_id_fkey
        FOREIGN KEY (group_role_id)
            REFERENCES group_roles(id) ON UPDATE CASCADE ON DELETE CASCADE,
)