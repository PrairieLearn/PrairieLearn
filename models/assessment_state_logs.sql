CREATE TABLE IF NOT EXISTS assessment_state_logs (
    id BIGSERIAL PRIMARY KEY,
    date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    open BOOLEAN,
    assessment_instance_id BIGINT NOT NULL REFERENCES assessment_instances ON DELETE CASCADE ON UPDATE CASCADE,
    auth_user_id BIGINT REFERENCES users ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS assessment_state_logs_assessment_instance_id_idx ON assessment_state_logs (assessment_instance_id);
