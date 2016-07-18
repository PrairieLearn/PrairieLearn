DO $$
BEGIN
    IF NOT EXISTS (SELECT * FROM pg_type WHERE typname = 'enum_question_type') THEN
        CREATE TYPE enum_question_type AS ENUM ('Calculation', 'MultipleChoice', 'Checkbox', 'File', 'MultipleTrueFalse', 'Backbone');
    END IF;
END;
$$;
