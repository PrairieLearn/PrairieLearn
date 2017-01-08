CREATE TABLE IF NOT EXISTS users (
    user_id BIGSERIAL PRIMARY KEY,
    uid text UNIQUE NOT NULL,
    uin char(9) UNIQUE,
    name text
);

DROP VIEW IF EXISTS student_assessment_scores CASCADE;
DROP VIEW IF EXISTS user_assessment_scores CASCADE;
DROP MATERIALIZED VIEW IF EXISTS user_assessment_durations CASCADE;
DROP VIEW IF EXISTS assessment_instance_durations CASCADE;

DO $$
BEGIN
    PERFORM 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'id';

    IF FOUND THEN
       ALTER TABLE users ALTER COLUMN id SET DATA TYPE BIGINT;
       ALTER TABLE users RENAME COLUMN id TO user_id;
    END IF;
END;
$$;

ALTER TABLE users ALTER COLUMN uid SET DATA TYPE TEXT;
ALTER TABLE users ALTER COLUMN name SET DATA TYPE TEXT;

ALTER TABLE users ALTER COLUMN uid SET NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS uin char(9);
CREATE UNIQUE INDEX IF NOT EXISTS users_uin_key ON users (uin);
