CREATE TABLE IF NOT EXISTS question_instances (
    id SERIAL PRIMARY KEY,
    qiid varchar(255) UNIQUE, -- temporary, delete after Mongo import
    date TIMESTAMP WITH TIME ZONE,
    test_question_id INTEGER REFERENCES test_questions,
    test_instance_id INTEGER REFERENCES test_instances,
    auth_user_id INTEGER REFERENCES users,
    number INTEGER,
    variant_seed varchar(255),
    params JSONB,
    true_answer JSONB,
    options JSONB
);
