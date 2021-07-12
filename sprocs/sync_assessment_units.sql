CREATE OR REPLACE FUNCTION
    sync_assessment_units(
        IN valid_course_info boolean,
        IN delete_unused boolean,
        IN course_info_assessment_units JSONB[],
        IN assessment_unit_names text[],
        IN syncing_course_id bigint
    ) RETURNS VOID
AS $$
DECLARE
    assessment_unit_item JSONB;
    used_assessment_unit_names text[];
    inserted_assessment_unit_names text[];
    missing_assessment_unit_names text;
BEGIN
    -- We will use the used_assessment_unit_names variable to track all
    -- the valid assessment sets (either existing or new).

    -- First insert all the explicit assessment sets, if we can. Keep
    -- a list of assessment IDs that we've used.
    IF valid_course_info THEN
        WITH new_assessment_units AS (
            INSERT INTO assessment_units (
                name,
                heading,
                number,
                course_id
            ) SELECT
                au->>0,
                au->>1,
                number,
                syncing_course_id
            FROM UNNEST(course_info_assessment_units) WITH ORDINALITY AS t(au, number)
            ON CONFLICT (name, course_id) DO UPDATE
            SET
                heading = EXCLUDED.heading,
                number = EXCLUDED.number
            RETURNING name
        )
        SELECT array_agg(name) INTO used_assessment_unit_names FROM new_assessment_units;
    ELSE
        -- If we don't have valid course info, we aren't going to
        -- delete anything so we need to account for existing
        -- assessment units.
        SELECT array_agg(name) INTO used_assessment_unit_names
        FROM assessment_units
        WHERE course_id = syncing_course_id;
    END IF;

    -- Make sure we have the "Default" assessment unit under all
    -- conditions, because we will use this as a last resort for
    -- assessments.
    INSERT INTO assessment_units (
              number, course_id
    ) VALUES (0,      syncing_course_id)
    ON CONFLICT (name, course_id) DO NOTHING;

    IF ('Default' != ALL(used_assessment_unit_names)) THEN
        used_assessment_unit_names := used_assessment_unit_names || '{Default}';
    END IF;

    -- Make sure we have an assessment unit for every assessment that
    -- we have data for. We auto-create assessment units where needed.
    WITH new_assessment_units AS (
        INSERT INTO assessment_units (
            name,
            heading,
            number,
            course_id
        ) SELECT
            name,
            concat(name, ' (Auto-generated from use in an assessment; add this assessment unit to your courseInfo.json file to customize)'),
            (array_length(used_assessment_unit_names, 1) + (row_number() OVER ())),
            syncing_course_id
        FROM
            (SELECT UNNEST(assessment_unit_names) EXCEPT SELECT UNNEST(used_assessment_unit_names))
            AS t(name)
        ORDER BY name
        ON CONFLICT (name, course_id) DO UPDATE
        SET
            name = EXCLUDED.name,
            heading = EXCLUDED.heading,
            number = EXCLUDED.number
        RETURNING name
    )
    SELECT array_agg(name) INTO inserted_assessment_unit_names FROM new_assessment_units;

    used_assessment_unit_names := array_cat(used_assessment_unit_names, inserted_assessment_unit_names);

    -- Finally delete unused assessment units. We only do this if all
    -- the JSON files (course and assessments) were valid, so we won't
    -- accidentally delete something that was in a temporarily-invalid
    -- JSON file.
    IF (valid_course_info AND delete_unused) THEN
        DELETE FROM assessment_units AS au
        WHERE
            au.course_id = syncing_course_id
            AND au.name NOT IN (SELECT unnest(used_assessment_unit_names))
            AND au.number != 0;
    END IF;

    -- Internal consistency check. All assessments should have an
    -- assessment unit.
    SELECT string_agg(name, ', ')
    INTO missing_assessment_unit_names
    FROM UNNEST(assessment_unit_names) AS t(name)
    WHERE name NOT IN (SELECT name FROM assessment_units WHERE course_id = syncing_course_id);
    IF (missing_assessment_unit_names IS NOT NULL) THEN
        RAISE EXCEPTION 'Assertion failure: Missing assessment unit names: %', missing_assessment_unit_names;
    END IF;
END;
$$ LANGUAGE plpgsql VOLATILE;
