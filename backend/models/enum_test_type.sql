DO $$
BEGIN
    IF NOT EXISTS (SELECT * FROM pg_type WHERE typname = 'enum_test_type') THEN
        CREATE TYPE enum_test_type AS ENUM ('Exam', 'RetryExam', 'Basic', 'Game');
    END IF;
END;
$$;
