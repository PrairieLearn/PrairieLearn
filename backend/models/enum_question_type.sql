DO $$
BEGIN
    IF NOT EXISTS (SELECT * FROM pg_type WHERE typname = 'enum_question_type') THEN
        CREATE TYPE enum_question_type AS ENUM ('Calculation', 'ShortAnswer', 'MultipleChoice', 'Checkbox', 'File', 'MultipleTrueFalse', 'Backbone');
    END IF;
END;
$$;

-- Can't add this here, but for reference:
-- ALTER TYPE enum_question_type ADD VALUE IF NOT EXISTS 'ShortAnswer';
