DROP FUNCTION IF EXISTS sync_assessment_sets(jsonb,bigint);
CREATE OR REPLACE FUNCTION
    sync_assessment_sets(
        IN assessment_sets JSONB,
        IN new_course_id bigint,
        OUT used_assessment_set_ids bigint[]
    ) RETURNS bigint[]
AS $$
BEGIN
    WITH new_assessment_sets AS (
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
            number,
            new_course_id
        FROM JSONB_ARRAY_ELEMENTS(sync_assessment_sets.assessment_sets) WITH ORDINALITY AS t(assessment_set, number)
        ON CONFLICT (name, course_id) DO UPDATE
        SET
            abbreviation = EXCLUDED.abbreviation,
            heading = EXCLUDED.heading,
            color = EXCLUDED.color,
            number = EXCLUDED.number
        RETURNING id
    )
    SELECT array_agg(id) INTO used_assessment_set_ids
    FROM new_assessment_sets;
END;
$$ LANGUAGE plpgsql VOLATILE;
