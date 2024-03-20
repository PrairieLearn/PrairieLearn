DO $$
BEGIN
    IF NOT EXISTS (SELECT * FROM pg_type WHERE typname = 'enum_exam_type') THEN
        CREATE TYPE enum_exam_type AS ENUM ('normal', 'review', 'final', 'online');
    END IF;
END;
$$;
