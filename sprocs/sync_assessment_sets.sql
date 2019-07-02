CREATE OR REPLACE FUNCTION
    sync_assessment_sets(
        IN assesment_sets JSONB,
        IN new_course_id bigint
    ) returns void
AS $$
DECLARE
    assessment_set JSONB;
BEGIN
    FOR assessment_set IN SELECT * FROM JSONB_ARRAY_ELEMENTS(assesment_sets) LOOP
        -- Insert assessment set
        INSERT INTO assessment_sets (
            abbreviation,
            name,
            heading,
            color,
            number,
            course_id
        ) VALUES (
            assessment_set->>'abbreviation',
            assessment_set->>'name',
            assessment_set->>'heading',
            assessment_set->>'color',
            assessment_set->>'number'::integer,
            new_course_id
        ) ON CONFLICT (name, course_id) DO UPDATE
        SET
            abbreviation = EXCLUDED.abbreviation,
            heading = EXCLUDED.heading,
            color = EXCLUDED.color,
            number = EXCLUDED.number;
    END LOOP;

    -- Delete excess assessment sets
    DELETE FROM assessment_sets
    WHERE
        course_id = new_course_id
        AND number > JSONB_ARRAY_LENGTH(assessment_sets);
END;
$$ LANGUAGE plpgsql VOLATILE;
