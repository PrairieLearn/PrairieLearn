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
$$
