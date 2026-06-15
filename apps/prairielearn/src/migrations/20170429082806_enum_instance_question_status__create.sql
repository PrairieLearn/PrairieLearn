DO $$
BEGIN
    IF NOT EXISTS (SELECT * FROM pg_type WHERE typname = 'enum_instance_question_status') THEN
        CREATE TYPE enum_instance_question_status AS ENUM ('complete', 'unanswered', 'saved', 'correct', 'incorrect');
    END IF;
END;
$$;
