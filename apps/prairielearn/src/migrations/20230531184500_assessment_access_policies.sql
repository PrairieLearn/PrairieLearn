-- enum_assessment_access_policy_type
CREATE TYPE enum_assessment_access_policy_type AS ENUM ('manual', 'extension_token');



-- Create assessment_access_policies table
CREATE TABLE IF NOT EXISTS assessment_access_policies (
    assessment_id BIGINT REFERENCES assessments(id) NOT NULL,
    user_id BIGINT REFERENCES users(user_id),
    group_id BIGINT REFERENCES groups(id),
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE NOT NULL,
    credit INTEGER NOT NULL,
    note TEXT,
    created_by BIGINT REFERENCES users(user_id) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    extension_type enum_assessment_access_policy_type NOT NULL,
    -- Constraint to check that either user_id or group_id (or both) is not null, but not both
    CHECK (
        (user_id IS NOT NULL AND group_id IS NULL)
        OR (user_id IS NULL AND group_id IS NOT NULL)
    )
);

