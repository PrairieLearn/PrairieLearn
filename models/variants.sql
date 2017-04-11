CREATE TABLE IF NOT EXISTS variants (
    id BIGSERIAL PRIMARY KEY,
    qiid text UNIQUE, -- temporary, delete after Mongo import
    date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    authn_user_id BIGINT REFERENCES users ON DELETE CASCADE ON UPDATE CASCADE,
    instance_question_id BIGINT NOT NULL REFERENCES instance_questions ON DELETE CASCADE ON UPDATE CASCADE,
    available BOOLEAN DEFAULT TRUE,
    number INTEGER,
    variant_seed text,
    params JSONB,
    true_answer JSONB,
    options JSONB,
    duration INTERVAL DEFAULT INTERVAL '0 seconds',
    first_duration INTERVAL,
    UNIQUE (instance_question_id, number)
);
