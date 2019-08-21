DROP FUNCTION IF EXISTS sync_assessments(JSONB, bigint, bigint, boolean);
DROP FUNCTION IF EXISTS sync_assessments(JSONB[], bigint, bigint, boolean);
CREATE OR REPLACE FUNCTION
    sync_assessments(
        IN disk_assessments_data JSONB[],
        IN syncing_course_id bigint,
        IN syncing_course_instance_id bigint
    ) RETURNS void
AS $$
DECLARE
    valid_assessment record;
    access_rule JSONB;
    zone JSONB;
    alternative_group JSONB;
    assessment_question JSONB;
    new_assessment_id bigint;
    new_assessment_ids bigint[];
    zone_index integer;
    new_zone_id bigint;
    new_alternative_group_id bigint;
    new_assessment_question_id bigint;
    new_assessment_question_ids bigint[];
BEGIN
    -- Move all our data into a temporary table so it's easier to work with
    DROP TABLE IF EXISTS disk_assessments;
    CREATE TEMPORARY TABLE disk_assessments (
        tid TEXT NOT NULL,
        uuid uuid,
        errors TEXT,
        warnings TEXT,
        data JSONB
    ) ON COMMIT DROP;
    INSERT INTO disk_assessments (
        tid,
        uuid,
        errors,
        warnings,
        data
    ) SELECT
        entries->>0,
        (entries->>1)::uuid,
        entries->>2,
        entries->>3,
        (entries->4)::JSONB
    FROM UNNEST(disk_assessments_data) AS entries;

    -- First, update the names of everything we have a UUID for
    UPDATE assessments AS a
    SET tid = da.tid, deleted_at = NULL
    FROM disk_assessments AS da
    WHERE
        da.uuid IS NOT NULL
        AND a.uuid = da.uuid
        AND a.course_instance_id = syncing_course_instance_id;

    -- Next, add known UUIDs to previously synced assessments without UUIDS
    UPDATE assessments AS a
    SET uuid = da.uuid 
    FROM disk_assessments AS da
    WHERE
        da.uuid IS NOT NULL
        AND a.tid = da.tid
        AND a.deleted_at IS NULL
        AND a.uuid IS NULL
        AND a.course_instance_id = syncing_course_instance_id;

    -- Next, soft-delete any rows for which we have a mismatched UUID
    UPDATE assessments AS a
    SET deleted_at = now()
    FROM disk_assessments AS da
    WHERE
        a.tid = da.tid
        AND a.deleted_at IS NOT NULL
        AND da.uuid IS NOT NULL
        AND a.uuid IS NOT NULL
        AND a.uuid != da.uuid
        AND a.course_instance_id = syncing_course_instance_id;

    -- Insert new rows for missing names for which we have a UUID
    WITH tids_to_insert AS (
        SELECT tid FROM disk_assessments WHERE uuid IS NOT NULL
        EXCEPT
        SELECT tid FROM assessments WHERE deleted_at IS NULL AND course_instance_id = syncing_course_instance_id
    )
    INSERT INTO assessments (
        tid,
        uuid,
        assessment_set_id,
        number,
        course_instance_id
    )
    SELECT
        ati.tid,
        da.uuid,
        (SELECT id FROM assessment_sets WHERE name = 'Unknown' AND course_id = syncing_course_id),
        '0',
        syncing_course_instance_id
    FROM
        tids_to_insert AS ati
        JOIN disk_assessments AS da ON (da.tid = ati.tid);

    -- Insert new rows for missing names for which we do not have a UUID
    WITH tids_to_insert AS (
        SELECT tid FROM disk_assessments WHERE uuid IS NULL
        EXCEPT
        SELECT tid FROM assessments WHERE deleted_at IS NULL AND course_instance_id = syncing_course_instance_id
    )
    INSERT INTO assessments (
        tid,
        assessment_set_id,
        number,
        course_instance_id
    )
    SELECT
        tid,
        (SELECT id FROM assessment_sets WHERE name = 'Unknown' AND course_id = syncing_course_id),
        '0',
        syncing_course_instance_id FROM tids_to_insert;

    -- Finally, soft-delete rows with unwanted names
    WITH tids_to_delete AS (
        SELECT tid FROM assessments WHERE deleted_at IS NULL AND course_instance_id = syncing_course_instance_id
        EXCEPT
        SELECT tid FROM disk_assessments
    )
    UPDATE assessments
    SET deleted_at = now()
    FROM tids_to_delete
    WHERE assessments.tid = tids_to_delete.tid;

    -- At this point, there will be exactly one non-deleted row for all tids
    -- that we loaded from disk. It is now safe to update all those rows with
    -- the new information from disk (if we have any).
    FOR valid_assessment IN (
        SELECT tid, data, warnings
        FROM disk_assessments AS da
        wHERE (da.errors IS NULL OR da.errors = '')
    ) LOOP
        UPDATE assessments AS a
        SET
            type = (valid_assessment.data->>'type')::enum_assessment_type,
            number = valid_assessment.data->>'number',
            title = valid_assessment.data->>'title',
            config = valid_assessment.data->'config',
            multiple_instance = (valid_assessment.data->>'multiple_instance')::boolean,
            shuffle_questions = (valid_assessment.data->>'shuffle_questions')::boolean,
            max_points = (valid_assessment.data->>'max_points')::double precision,
            auto_close = (valid_assessment.data->>'auto_close')::boolean,
            text = valid_assessment.data->>'text',
            assessment_set_id = aggregates.assessment_set_id,
            constant_question_value = (valid_assessment.data->>'constant_question_value')::boolean,
            allow_issue_reporting = (valid_assessment.data->>'allow_issue_reporting')::boolean,
            sync_errors = NULL,
            sync_warnings = valid_assessment.warnings
        FROM
            (
                SELECT
                    tid,
                    (SELECT id FROM assessment_sets WHERE name = da.data->>'set_name' AND course_id = syncing_course_id) AS assessment_set_id
                FROM disk_assessments AS da
            ) AS aggregates
        WHERE
            a.tid = valid_assessment.tid
            AND a.tid = aggregates.tid
            AND a.course_instance_id = syncing_course_instance_id
        RETURNING id INTO new_assessment_id;
        new_assessment_ids = array_append(new_assessment_ids, new_assessment_id);

        -- Now process all access rules for this assessment
        FOR access_rule IN SELECT * FROM JSONB_ARRAY_ELEMENTS(valid_assessment.data->'allowAccess') LOOP
            INSERT INTO assessment_access_rules (
                assessment_id,
                number,
                mode,
                role,
                credit,
                uids,
                time_limit_min,
                password,
                seb_config,
                exam_uuid,
                start_date,
                end_date)
            (
                SELECT
                    new_assessment_id,
                    (access_rule->>'number')::integer,
                    (access_rule->>'mode')::enum_mode,
                    (access_rule->>'role')::enum_role,
                    (access_rule->>'credit')::integer,
                    (SELECT ARRAY_AGG(uids)::text[] FROM JSONB_ARRAY_ELEMENTS_TEXT(COALESCE(access_rule->>'uids', '[]')::jsonb) uids)::text[],
                    (access_rule->>'time_limit_min')::integer,
                    access_rule->>'password',
                    access_rule->'seb_config',
                    (access_rule->>'exam_uuid')::uuid,
                    input_date(access_rule->>'start_date', COALESCE(ci.display_timezone, c.display_timezone, 'America/Chicago')),
                    input_date(access_rule->>'end_date', COALESCE(ci.display_timezone, c.display_timezone, 'America/Chicago'))
                FROM
                    assessments AS a
                    JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
                    JOIN pl_courses AS c ON (c.id = ci.course_id)
                WHERE
                    a.id = new_assessment_id
            )
            ON CONFLICT (number, assessment_id) DO UPDATE
            SET
                mode = EXCLUDED.mode,
                role = EXCLUDED.role,
                credit = EXCLUDED.credit,
                time_limit_min = EXCLUDED.time_limit_min,
                password = EXCLUDED.password,
                exam_uuid = EXCLUDED.exam_uuid,
                uids = EXCLUDED.uids,
                seb_config = EXCLUDED.seb_config,
                start_date = EXCLUDED.start_date,
                end_date = EXCLUDED.end_date;
        END LOOP;

        -- Delete excess access rules
        DELETE FROM assessment_access_rules
        WHERE
            assessment_id = new_assessment_id
            AND number > jsonb_array_length(valid_assessment.data->'allowAccess');

        -- Insert all zones for this assessment
        zone_index := 0;
        FOR zone IN SELECT * FROM JSONB_ARRAY_ELEMENTS(valid_assessment.data->'zones') LOOP
            INSERT INTO zones (
                assessment_id,
                number,
                title,
                max_points,
                number_choose,
                best_questions
            ) VALUES (
                new_assessment_id,
                (zone->>'number')::integer,
                zone->>'title',
                (zone->>'max_points')::double precision,
                (zone->>'number_choose')::integer,
                (zone->>'best_questions')::integer
            )
            ON CONFLICT (number, assessment_id) DO UPDATE
            SET
                title = EXCLUDED.title,
                max_points = EXCLUDED.max_points,
                number_choose = EXCLUDED.number_choose,
                best_questions = EXCLUDED.best_questions
            RETURNING id INTO new_zone_id;

            -- Insert each alternative group in this zone
            FOR alternative_group IN SELECT * FROM JSONB_ARRAY_ELEMENTS(valid_assessment.data->'alternativeGroups'->zone_index) LOOP
                INSERT INTO alternative_groups (
                    number,
                    number_choose,
                    assessment_id,
                    zone_id
                ) VALUES (
                    (alternative_group->>'number')::integer,
                    (alternative_group->>'number_choose')::integer,
                    new_assessment_id,
                    new_zone_id
                ) ON CONFLICT (number, assessment_id) DO UPDATE
                SET
                    number_choose = EXCLUDED.number_choose,
                    zone_id = EXCLUDED.zone_id
                RETURNING id INTO new_alternative_group_id;

                -- Insert an assessment question for each question in this alternative group
                FOR assessment_question IN SELECT * FROM JSONB_ARRAY_ELEMENTS(alternative_group->'questions') LOOP
                    INSERT INTO assessment_questions AS aq (
                        number,
                        max_points,
                        init_points,
                        points_list,
                        force_max_points,
                        tries_per_variant,
                        deleted_at,
                        assessment_id,
                        question_id,
                        alternative_group_id,
                        number_in_alternative_group
                    ) VALUES (
                        (assessment_question->>'number')::integer,
                        (assessment_question->>'max_points')::double precision,
                        (assessment_question->>'init_points')::double precision,
                        (SELECT ARRAY_AGG(points)::double precision[] FROM JSONB_ARRAY_ELEMENTS_TEXT(COALESCE(assessment_question->>'points_list', '[]')::jsonb) points)::double precision[],
                        (assessment_question->>'force_max_points')::boolean,
                        (assessment_question->>'tries_per_variant')::integer,
                        NULL,
                        new_assessment_id,
                        (assessment_question->>'question_id')::bigint,
                        new_alternative_group_id,
                        (assessment_question->>'number_in_alternative_group')::integer
                    ) ON CONFLICT (question_id, assessment_id) DO UPDATE
                    SET
                        number = EXCLUDED.number,
                        max_points = EXCLUDED.max_points,
                        points_list = EXCLUDED.points_list,
                        init_points = EXCLUDED.init_points,
                        force_max_points = EXCLUDED.force_max_points,
                        tries_per_variant = EXCLUDED.tries_per_variant,
                        deleted_at = EXCLUDED.deleted_at,
                        alternative_group_id = EXCLUDED.alternative_group_id,
                        number_in_alternative_group = EXCLUDED.number_in_alternative_group,
                        question_id = EXCLUDED.question_id
                    RETURNING aq.id INTO new_assessment_question_id;
                    new_assessment_question_ids := array_append(new_assessment_question_ids, new_assessment_question_id);
                END LOOP;
            END LOOP;
            zone_index := zone_index + 1;
        END LOOP;

        -- Delete excess zones for this assessment
        DELETE FROM zones
        WHERE
            assessment_id = new_assessment_id
            AND number > jsonb_array_length(valid_assessment.data->'zones');

        -- Delete excess alternative groups for this assessment
        DELETE FROM alternative_groups
        WHERE
            assessment_id = new_assessment_id
            AND ((number < 1) OR (number > (valid_assessment.data->>'lastAlternativeGroupNumber')::integer));

        -- Soft-delete unused assessment questions
        UPDATE assessment_questions AS aq
        SET
            deleted_at = CURRENT_TIMESTAMP
        WHERE
            aq.assessment_id = new_assessment_id
            AND aq.deleted_at IS NULL
            AND aq.id NOT IN (SELECT unnest(new_assessment_question_ids));
    END LOOP;

    -- Now that all assessments have numbers, make a second pass over them to
    -- assign every assessment an order_by attribute. This computes the natural
    -- ordering over all assessments.
    -- Source: http://www.rhodiumtoad.org.uk/junk/naturalsort.sql
    UPDATE assessments AS a
    SET order_by = assessments_with_ordinality.order_by
    FROM (
        SELECT
            tid,
            row_number() OVER (ORDER BY (
                SELECT string_agg(convert_to(coalesce(r[2],
                    length(length(r[1])::text) || length(r[1])::text || r[1]),
                    'SQL_ASCII'),'\x00')
                FROM regexp_matches(number, '0*([0-9]+)|([^0-9]+)', 'g') r 
            ) ASC) AS order_by
        FROM assessments WHERE course_instance_id = syncing_course_instance_id AND 1 = 2
    ) AS assessments_with_ordinality
    WHERE
        a.tid = assessments_with_ordinality.tid
        AND a.course_instance_id = syncing_course_instance_id;

    -- Second pass: add errors and warnings where needed
    UPDATE assessments AS a
    SET
        sync_errors = da.errors,
        sync_warnings = da.warnings
    FROM disk_assessments AS da
    WHERE
        a.tid = da.tid
        AND a.course_instance_id = syncing_course_instance_id
        AND (da.errors IS NOT NULL AND da.errors != '');

    -- Finally, clean up any other leftover models
    -- Soft-delete unused assessment questions
    UPDATE assessment_questions AS aq
    SET
        deleted_at = CURRENT_TIMESTAMP
    FROM
        assessments AS a
    WHERE
        a.id = aq.assessment_id
        AND a.course_instance_id = syncing_course_instance_id
        AND aq.deleted_at IS NULL
        AND a.deleted_at IS NOT NULL;

    -- Delete unused assessment access rules
    DELETE FROM assessment_access_rules AS aar
    USING assessments AS a
    WHERE
        aar.assessment_id = a.id
        AND a.deleted_at IS NOT NULL
        AND a.course_instance_id = syncing_course_instance_id;

    -- Delete unused zones
    DELETE FROM zones AS z
    USING assessments AS a
    WHERE
        z.assessment_id = a.id
        AND a.deleted_at IS NOT NULL
        AND a.course_instance_id = syncing_course_instance_id;
END;
$$ LANGUAGE plpgsql VOLATILE;
