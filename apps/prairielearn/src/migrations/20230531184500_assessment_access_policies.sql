CREATE TABLE IF NOT EXISTS
  assessment_access_policies (
    id BIGSERIAL PRIMARY KEY,
    assessment_id BIGINT REFERENCES assessments (id) ON UPDATE CASCADE ON DELETE CASCADE,
    user_id BIGINT REFERENCES users (user_id) ON UPDATE CASCADE ON DELETE CASCADE,
    group_id BIGINT REFERENCES groups (id) ON UPDATE CASCADE ON DELETE CASCADE,
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE NOT NULL,
    credit INTEGER NOT NULL,
    note TEXT,
    created_by BIGINT REFERENCES users (user_id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CHECK (num_nonnulls(user_id, group_id) <= 1)
  );