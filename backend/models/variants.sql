CREATE TABLE IF NOT EXISTS variants (
    id SERIAL PRIMARY KEY,
    qiid varchar(255) UNIQUE, -- temporary, delete after Mongo import
    date TIMESTAMP WITH TIME ZONE,
    instance_question_id INTEGER NOT NULL REFERENCES test_questions ON DELETE CASCADE ON UPDATE CASCADE,
    number INTEGER,
    variant_seed varchar(255),
    params JSONB,
    true_answer JSONB,
    options JSONB
);
