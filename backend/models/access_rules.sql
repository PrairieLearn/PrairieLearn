CREATE TABLE IF NOT EXISTS access_rules (
    id SERIAL PRIMARY KEY,
    test_id INTEGER REFERENCES tests,
    mode enum_mode,
    role enum_role,
    uids varchar(255)[],
    start_date TIMESTAMP WITH TIME ZONE,
    end_date TIMESTAMP WITH TIME ZONE,
    credit INTEGER
);
