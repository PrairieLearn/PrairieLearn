CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGSERIAL PRIMARY KEY,
    date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    authn_user_id BIGINT,
    course_id BIGINT,
    course_instance_id BIGINT,
    user_id BIGINT,
    table_name TEXT,
    column_name TEXT,
    row_id BIGINT,
    action TEXT,
    parameters JSONB,
    old_state JSONB,
    new_state JSONB
);

ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS table_name text;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS column_name text;
