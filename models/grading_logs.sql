CREATE TABLE IF NOT EXISTS grading_logs (
    id BIGSERIAL PRIMARY KEY,
    date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    submission_id BIGINT NOT NULL REFERENCES submissions ON DELETE CASCADE ON UPDATE CASCADE,
    grading_method enum_grading_method,
    grading_requested_at TIMESTAMP WITH TIME ZONE,
    grading_request_canceled_at TIMESTAMP WITH TIME ZONE,
    grading_request_canceled_by BIGINT REFERENCES users ON DELETE CASCADE ON UPDATE CASCADE,
    graded_at TIMESTAMP WITH TIME ZONE,
    graded_by BIGINT REFERENCES users ON DELETE CASCADE ON UPDATE CASCADE,
    score DOUBLE PRECISION,
    correct BOOLEAN,
    feedback JSONB,
    auth_user_id BIGINT REFERENCES users ON DELETE CASCADE ON UPDATE CASCADE,
    grading_submitted_at TIMESTAMP WITH  TIME ZONE,
    grading_started_at TIMESTAMP WITH TIME ZONE,
    grading_finished_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS grading_logs_submission_id_idx ON grading_logs (submission_id);

ALTER TABLE grading_logs ADD COLUMN IF NOT EXISTS grading_submitted_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE grading_logs ADD COLUMN IF NOT EXISTS grading_started_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE grading_logs ADD COLUMN IF NOT EXISTS grading_finished_at TIMESTAMP WITH TIME ZONE;
