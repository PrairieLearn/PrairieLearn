DO $$
BEGIN
    IF NOT EXISTS (SELECT * FROM pg_type WHERE typname = 'enum_assessment_type') THEN
        CREATE TYPE enum_assessment_type AS ENUM ('Exam', 'RetryExam', 'Basic', 'Game');
    END IF;
END;
$$;
