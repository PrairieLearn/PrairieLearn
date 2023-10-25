-- Create assessment_access_policies table
CREATE TABLE IF NOT EXISTS
  assessment_access_policies (
    id BIGSERIAL PRIMARY KEY,
    assessment_id BIGINT REFERENCES assessments (id) ON UPDATE CASCADE ON DELETE CASCADE NULLS NOT DISTINCT,
    user_id BIGINT REFERENCES users (user_id) ON UPDATE CASCADE ON DELETE CASCADE NULLS NOT DISTINCT,
    group_id BIGINT REFERENCES groups (id) ON UPDATE CASCADE ON DELETE CASCADE NULLS NOT DISTINCT,
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE NOT NULL,
    credit INTEGER NOT NULL,
    note TEXT,
    created_by BIGINT REFERENCES users (user_id) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    -- CHECK (
    --     (student_uid IS NOT NULL AND group_id IS NULL)
    --     OR (student_uid IS NULL AND group_id IS NOT NULL)
    -- )
    CHECK (num_nonnulls (user_id, group_id) <= 1),
  );
