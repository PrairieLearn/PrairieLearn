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

DO $$
    BEGIN
        ALTER TABLE variants ADD COLUMN available BOOLEAN DEFAULT TRUE;
    EXCEPTION
        WHEN duplicate_column THEN -- do nothing
    END;
$$;

ALTER TABLE variants ALTER COLUMN id SET DATA TYPE BIGINT;
ALTER TABLE variants ALTER COLUMN instance_question_id SET DATA TYPE BIGINT;
ALTER TABLE variants ALTER COLUMN qiid SET DATA TYPE TEXT;
ALTER TABLE variants ALTER COLUMN variant_seed SET DATA TYPE TEXT;
