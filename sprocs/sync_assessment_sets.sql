CREATE OR REPLACE FUNCTION
    sync_assessment_sets(
        IN assessment_sets JSONB,
        IN new_course_id bigint
    ) returns void
AS $$
BEGIN
    INSERT INTO assessment_sets (
        abbreviation,
        name,
        heading,
        color,
        number,
        course_id
    ) SELECT
        assessment_set->>'abbreviation',
        assessment_set->>'name',
        assessment_set->>'heading',
        assessment_set->>'color',
        (assessment_set->>'number')::integer,
        new_course_id
    FROM JSONB_ARRAY_ELEMENTS(sync_assessment_sets.assessment_sets) AS assessment_set
    ON CONFLICT (name, course_id) DO UPDATE
    SET
        abbreviation = EXCLUDED.abbreviation,
        heading = EXCLUDED.heading,
        color = EXCLUDED.color,
        number = EXCLUDED.number;

    -- Delete excess assessment sets
    DELETE FROM assessment_sets
    WHERE
        course_id = new_course_id
        AND number > JSONB_ARRAY_LENGTH(sync_assessment_sets.assessment_sets);
END;
$$ LANGUAGE plpgsql VOLATILE;
