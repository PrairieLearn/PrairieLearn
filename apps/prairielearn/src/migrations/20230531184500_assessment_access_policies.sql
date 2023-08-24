CREATE SEQUENCE IF NOT EXISTS assessment_access_policies_id_seq;

-- Create assessment_access_policies table
CREATE TABLE IF NOT EXISTS assessment_access_policies (
    id BIGINT NOT NULL DEFAULT nextval('assessment_access_policies_id_seq'::regclass),
    assessment_id BIGINT REFERENCES assessments(id)ON UPDATE CASCADE ON DELETE CASCADE UNIQUE NULLS NOT DISTINCT,
    user_id BIGINT REFERENCES users(user_id) ON UPDATE CASCADE ON DELETE CASCADE UNIQUE NULLS NOT DISTINCT,
    -- student_uid TEXT,
    group_id BIGINT REFERENCES groups(id) ON UPDATE CASCADE ON DELETE CASCADE UNIQUE NULLS NOT DISTINCT,
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE NOT NULL,
    credit INTEGER NOT NULL,
    note TEXT,
    created_by TEXT REFERENCES users(uid) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    -- CHECK (
    --     (student_uid IS NOT NULL AND group_id IS NULL)
    --     OR (student_uid IS NULL AND group_id IS NOT NULL)
    -- )
    CHECK (
        num_nonnulls(user_id, group_id) <= 1
    ),
    PRIMARY KEY (id)
);

