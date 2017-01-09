CREATE TABLE IF NOT EXISTS variants (
    id BIGSERIAL PRIMARY KEY,
    qiid text UNIQUE, -- temporary, delete after Mongo import
    date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    instance_question_id BIGINT NOT NULL REFERENCES instance_questions ON DELETE CASCADE ON UPDATE CASCADE,
    available BOOLEAN DEFAULT TRUE,
    number INTEGER,
    variant_seed text,
    params JSONB,
    true_answer JSONB,
    options JSONB,
    UNIQUE (number, instance_question_id)
);
