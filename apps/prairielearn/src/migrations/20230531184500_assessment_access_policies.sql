-- enum_type
DO $$
BEGIN
    IF NOT EXISTS (SELECT * FROM pg_type WHERE typname = 'enum_type') THEN
        CREATE TYPE enum_type AS ENUM ('manual', 'extension_token');
    END IF;
END;
$$;


-- Create assessment_access_policies table
CREATE TABLE IF NOT EXISTS assessment_access_policies (
    assessment_id BIGINT REFERENCES assessments(id) NOT NULL,
    user_id BIGINT REFERENCES users(user_id),
    group_id BIGINT REFERENCES groups(id),
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE NOT NULL,
    credit INTEGER,
    note TEXT,
    created_by BIGINT REFERENCES users(user_id) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    type enum_type NOT NULL
);
