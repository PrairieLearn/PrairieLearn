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
    first_duration INTERVAL DEFAULT INTERVAL '0 seconds',
    UNIQUE (instance_question_id, number)
);

ALTER TABLE variants DROP CONSTRAINT IF EXISTS variants_number_instance_question_id_key;

DO $$
BEGIN
    IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints
            WHERE constraint_name = 'variants_instance_question_id_number_key'
        )
        THEN
        ALTER TABLE variants ADD UNIQUE (instance_question_id, number);
    END IF;
END;
$$;

ALTER TABLE variants ADD COLUMN IF NOT EXISTS authn_user_id bigint;

DO $$
BEGIN
    IF NOT EXISTS (
            SELECT 1 FROM information_schema.table_constraints
            WHERE constraint_name = 'variants_authn_user_id_fkey'
        )
        THEN
        ALTER TABLE variants ADD FOREIGN KEY (authn_user_id) REFERENCES users ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END;
$$;

ALTER TABLE variants ADD COLUMN IF NOT EXISTS duration INTERVAL DEFAULT INTERVAL '0 seconds';
ALTER TABLE variants ADD COLUMN IF NOT EXISTS first_duration INTERVAL DEFAULT INTERVAL '0 seconds';
