CREATE OR REPLACE FUNCTION
    sync_assessment_modules(
        IN valid_course_info boolean,
        IN delete_unused boolean,
        IN course_info_assessment_modules JSONB[],
        IN assessment_module_names text[],
        IN syncing_course_id bigint
    ) RETURNS VOID
AS $$
DECLARE
    assessment_module_item JSONB;
    used_assessment_module_names text[];
    inserted_assessment_module_names text[];
    missing_assessment_module_names text;
BEGIN
    -- We will use the used_assessment_module_names variable to track all
    -- the valid assessment modules (either existing or new).

    -- First insert all the explicit assessment modules, if we can. Keep
    -- a list of assessment IDs that we've used.
    IF valid_course_info THEN
        WITH new_assessment_modules AS (
            INSERT INTO assessment_modules (
                name,
                heading,
                number,
                course_id
            ) SELECT
                am->>0,
                am->>1,
                number,
                syncing_course_id
            FROM UNNEST(course_info_assessment_modules) WITH ORDINALITY AS t(am, number)
            ON CONFLICT (name, course_id) DO UPDATE
            SET
                heading = EXCLUDED.heading,
                number = EXCLUDED.number
            RETURNING name
        )
        SELECT array_agg(name) INTO used_assessment_module_names FROM new_assessment_modules;
    ELSE
        -- If we don't have valid course info, we aren't going to
        -- delete anything so we need to account for existing
        -- assessment modules.
        SELECT array_agg(name) INTO used_assessment_module_names
        FROM assessment_modules
        WHERE course_id = syncing_course_id;
    END IF;

    -- Make sure we have the "Default" assessment module under all
    -- conditions, because we will use this as a last resort for
    -- assessments.
    --
    -- If the instructor has explicitly created a module named "Default",
    -- we'll use that, including whatever number they've assigned to it.
    INSERT INTO
        assessment_modules (name, number, course_id)
    VALUES
        ('Default', 0, syncing_course_id)
    ON CONFLICT (name, course_id) DO NOTHING;

    IF ('Default' != ALL(used_assessment_module_names)) THEN
        used_assessment_module_names := used_assessment_module_names || '{Default}';
    END IF;

    -- Make sure we have an assessment module for every assessment that
    -- we have data for. We auto-create assessment modules where needed.
    WITH new_assessment_modules AS (
        INSERT INTO assessment_modules (
            name,
            heading,
            number,
            course_id
        ) SELECT
            name,
            concat(name, ' (Auto-generated from use in an assessment; add this assessment module to your infoCourse.json file to customize)'),
            (array_length(used_assessment_module_names, 1) + (row_number() OVER ())),
            syncing_course_id
        FROM
            (SELECT UNNEST(assessment_module_names) EXCEPT SELECT UNNEST(used_assessment_module_names))
            AS t(name)
        ORDER BY name
        ON CONFLICT (name, course_id) DO UPDATE
        SET
            name = EXCLUDED.name,
            heading = EXCLUDED.heading,
            number = EXCLUDED.number
        RETURNING name
    )
    SELECT array_agg(name) INTO inserted_assessment_module_names FROM new_assessment_modules;

    used_assessment_module_names := array_cat(used_assessment_module_names, inserted_assessment_module_names);

    -- Finally delete unused assessment modules. We only do this if all
    -- the JSON files (course and assessments) were valid, so we won't
    -- accidentally delete something that was in a temporarily-invalid
    -- JSON file.
    IF (valid_course_info AND delete_unused) THEN
        DELETE FROM assessment_modules AS am
        WHERE
            am.course_id = syncing_course_id
            AND am.name NOT IN (SELECT unnest(used_assessment_module_names))
            AND am.number != 0;
    END IF;

    -- Internal consistency check. All assessments should have an
    -- assessment module.
    SELECT string_agg(name, ', ')
    INTO missing_assessment_module_names
    FROM UNNEST(assessment_module_names) AS t(name)
    WHERE name NOT IN (SELECT name FROM assessment_modules WHERE course_id = syncing_course_id);
    IF (missing_assessment_module_names IS NOT NULL) THEN
        RAISE EXCEPTION 'Assertion failure: Missing assessment module names: %', missing_assessment_module_names;
    END IF;
END;
$$ LANGUAGE plpgsql VOLATILE;
