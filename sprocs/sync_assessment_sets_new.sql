CREATE OR REPLACE FUNCTION
    sync_assessment_sets_new(
        IN valid_course_info boolean,
        IN course_info_assessment_sets JSONB[],
        IN assessment_set_names text[],
        IN syncing_course_id bigint,
        OUT used_assessment_set_ids bigint[]
    )
AS $$
DECLARE
    assessment_set_item JSONB;
    inserted_assessment_set_ids bigint[];
    num_existing_assessment_sets bigint;
BEGIN
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
            RETURNING id
        )
        SELECT array_agg(id) INTO used_assessment_set_ids FROM (SELECT id FROM new_assessment_sets) AS ids;

        num_existing_assessment_sets := array_length(used_assessment_set_ids, 1);
    ELSE
        SELECT COUNT(*) INTO num_existing_assessment_sets
        FROM assessment_sets
        WHERE course_id = syncing_course_id;
    END IF;

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
            concat(name, ' (Auto-generated from use in a question; add this assessment set to your courseInfo.json file to customize)'),
            'gray1',
            (num_existing_assessment_sets + number),
            syncing_course_id
        FROM UNNEST(assessment_set_names) WITH ORDINALITY AS t(name, number)
        ON CONFLICT (name, course_id) DO NOTHING
        RETURNING id
    )
    SELECT array_agg(id) INTO inserted_assessment_set_ids FROM (SELECT id FROM new_assessment_sets) AS ids;
    used_assessment_set_ids := array_cat(used_assessment_set_ids, inserted_assessment_set_ids);
END;
$$ LANGUAGE plpgsql VOLATILE;
