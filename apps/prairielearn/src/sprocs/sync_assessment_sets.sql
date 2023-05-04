CREATE FUNCTION
    sync_assessment_sets(
        IN valid_course_info boolean,
        IN delete_unused boolean,
        IN course_info_assessment_sets JSONB[],
        IN assessment_set_names text[],
        IN syncing_course_id bigint
    ) RETURNS VOID
AS $$
DECLARE
    assessment_set_item JSONB;
    used_assessment_set_names text[];
    inserted_assessment_set_names text[];
    missing_assessment_set_names text;
BEGIN
    -- We will use the used_assessment_set_names variable to track all
    -- the valid assessment sets (either existing or new).

    -- First insert all the explicit assessment sets, if we can. Keep
    -- a list of assessment IDs that we've used.
    IF valid_course_info THEN
        WITH new_assessment_sets AS (
            INSERT INTO assessment_sets (
                name,
                abbreviation,
                heading,
                color,
                number,
                course_id
            ) SELECT
                aset->>0,
                aset->>1,
                aset->>2,
                aset->>3,
                number,
                syncing_course_id
            FROM UNNEST(course_info_assessment_sets) WITH ORDINALITY AS t(aset, number)
            ON CONFLICT (name, course_id) DO UPDATE
            SET
                abbreviation = EXCLUDED.abbreviation,
                heading = EXCLUDED.heading,
                color = EXCLUDED.color,
                number = EXCLUDED.number
            RETURNING name
        )
        SELECT array_agg(name) INTO used_assessment_set_names FROM new_assessment_sets;
    ELSE
        -- If we don't have valid course info, we aren't going to
        -- delete anything so we need to account for existing
        -- assessment sets.
        SELECT array_agg(name) INTO used_assessment_set_names
        FROM assessment_sets
        WHERE course_id = syncing_course_id;
    END IF;

    -- Make sure we have the "Unknown" assessment set under all
    -- conditions, because we will use this as a last resort for
    -- assessments.
    INSERT INTO assessment_sets (
              name,      abbreviation, heading,   color,  number, course_id
    ) VALUES ('Unknown', 'U',          'Unknown', 'red3', 1,      syncing_course_id)
    ON CONFLICT (name, course_id) DO NOTHING;

    IF ('Unknown' != ALL(used_assessment_set_names)) THEN
        used_assessment_set_names := used_assessment_set_names || 'Unknown';
    END IF;

    -- Make sure we have an assessment set for every assessment that
    -- we have data for. We auto-create assessment sets where needed.
    WITH new_assessment_sets AS (
        INSERT INTO assessment_sets (
            name,
            abbreviation,
            heading,
            color,
            number,
            course_id
        ) SELECT
            name,
            name,
            concat(name, ' (Auto-generated from use in an assessment; add this assessment set to your infoCourse.json file to customize)'),
            'gray1',
            (array_length(used_assessment_set_names, 1) + (row_number() OVER ())),
            syncing_course_id
        FROM
            (SELECT UNNEST(assessment_set_names) EXCEPT SELECT UNNEST(used_assessment_set_names))
            AS t(name)
        ORDER BY name
        ON CONFLICT (name, course_id) DO UPDATE
        SET
            abbreviation = EXCLUDED.abbreviation,
            heading = EXCLUDED.heading,
            color = EXCLUDED.color,
            number = EXCLUDED.number
        RETURNING name
    )
    SELECT array_agg(name) INTO inserted_assessment_set_names FROM new_assessment_sets;

    used_assessment_set_names := array_cat(used_assessment_set_names, inserted_assessment_set_names);

    -- Finally delete unused assessment sets. We only do this if all
    -- the JSON files (course and assessments) were valid, so we won't
    -- accidentally delete something that was in a temporarily-invalid
    -- JSON file.
    IF (valid_course_info AND delete_unused) THEN
        DELETE FROM assessment_sets AS aset
        WHERE
            aset.course_id = syncing_course_id
            AND aset.name NOT IN (SELECT unnest(used_assessment_set_names));
    END IF;

    -- Internal consistency check. All assessments should have an
    -- assessment set.
    SELECT string_agg(name, ', ')
    INTO missing_assessment_set_names
    FROM UNNEST(assessment_set_names) AS t(name)
    WHERE name NOT IN (SELECT name FROM assessment_sets WHERE course_id = syncing_course_id);
    IF (missing_assessment_set_names IS NOT NULL) THEN
        RAISE EXCEPTION 'Assertion failure: Missing assessment set names: %', missing_assessment_set_names;
    END IF;
END;
$$ LANGUAGE plpgsql VOLATILE;
