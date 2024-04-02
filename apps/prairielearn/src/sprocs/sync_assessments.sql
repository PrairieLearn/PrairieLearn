CREATE FUNCTION
    sync_assessments(
        IN disk_assessments_data JSONB[],
        IN syncing_course_id bigint,
        IN syncing_course_instance_id bigint,
        IN check_sharing_on_sync boolean,
        OUT name_to_id_map JSONB
    )
AS $$
DECLARE
    missing_dest_tids TEXT;
    missing_src_tids TEXT;
    mismatched_uuid_tids TEXT;
    valid_assessment record;
    group_role JSONB;
    valid_group_role record;
    access_rule JSONB;
    zone JSONB;
    alternative_group JSONB;
    assessment_question JSONB;
    new_assessment_id bigint;
    new_assessment_ids bigint[];
    new_question_id bigint;
    zone_index integer;
    new_zone_id bigint;
    new_alternative_group_id bigint;
    new_assessment_question_id bigint;
    new_assessment_question_ids bigint[];
    bad_assessments text;
    new_group_role_names text[];
    new_group_role_name text;
    question_grading_method enum_grading_method;
    computed_manual_points double precision;
    computed_max_auto_points double precision;
BEGIN
    -- The sync algorithm used here is described in the preprint
    -- "Preserving identity during opportunistic unidirectional
    -- synchronization via two-fold identifiers".

    -- Move all our data into a temporary table so it's easier to work with

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

    -- Synchronize the dest (assessments) with the src
    -- (disk_assessments). This soft-deletes, un-soft-deletes, and
    -- inserts new rows in assessments. No data is synced yet. Only the
    -- (id, course_instance_id, uuid, tid, deleted_at) columns are used.

    WITH
    matched_rows AS (
        -- See `sync_questions.sql` for an explanation of the use of DISTINCT ON.
        SELECT DISTINCT ON (src_tid)
            src.tid AS src_tid,
            src.uuid AS src_uuid,
            dest.id AS dest_id
        FROM disk_assessments AS src LEFT JOIN assessments AS dest ON (
            dest.course_instance_id = syncing_course_instance_id
            AND (
                src.uuid = dest.uuid
                OR (
                    (src.uuid IS NULL OR dest.uuid IS NULL)
                    AND src.tid = dest.tid AND dest.deleted_at IS NULL
                )
            )
        )
        ORDER BY src_tid, (src.uuid = dest.uuid) DESC NULLS LAST
    ),
    deactivate_unmatched_dest_rows AS (
        UPDATE assessments AS dest
        SET deleted_at = now()
        WHERE dest.id NOT IN (
            SELECT dest_id FROM matched_rows WHERE dest_id IS NOT NULL
        ) AND dest.deleted_at IS NULL AND dest.course_instance_id = syncing_course_instance_id
    ),
    update_matched_dest_rows AS (
        UPDATE assessments AS dest
        SET tid = src_tid, uuid = src_uuid, deleted_at = NULL
        FROM matched_rows
        WHERE dest.id = dest_id AND dest.course_instance_id = syncing_course_instance_id
    ),
    insert_unmatched_src_rows AS (
        INSERT INTO assessments AS dest (course_instance_id, tid, uuid, deleted_at)
        SELECT syncing_course_instance_id, src_tid, src_uuid, NULL
        FROM matched_rows
        WHERE dest_id IS NULL
        RETURNING dest.tid AS src_tid, dest.id AS inserted_dest_id
    )
    -- Make a map from TID to ID to return to the caller
    SELECT jsonb_object_agg(src_tid, COALESCE(dest_id, inserted_dest_id))
    INTO name_to_id_map
    FROM matched_rows LEFT JOIN insert_unmatched_src_rows USING (src_tid);

    -- Internal consistency checks to ensure that dest (assessments) and
    -- src (disk_assessments) are in fact synchronized.

    SELECT string_agg(src.tid, ', ')
    INTO missing_dest_tids
    FROM disk_assessments AS src
    WHERE src.tid NOT IN (SELECT dest.tid FROM assessments AS dest WHERE dest.course_instance_id = syncing_course_instance_id AND dest.deleted_at IS NULL);
    IF (missing_dest_tids IS NOT NULL) THEN
        RAISE EXCEPTION 'Assertion failure: TIDs on disk but not synced to DB: %', missing_dest_tids;
    END IF;

    SELECT string_agg(dest.tid, ', ')
    INTO missing_src_tids
    FROM assessments AS dest
    WHERE dest.course_instance_id = syncing_course_instance_id AND dest.deleted_at IS NULL AND dest.tid NOT IN (SELECT src.tid FROM disk_assessments AS src);
    IF (missing_src_tids IS NOT NULL) THEN
        RAISE EXCEPTION 'Assertion failure: TIDs in DB but not on disk: %', missing_src_tids;
    END IF;

    SELECT string_agg(src.tid, ', ')
    INTO mismatched_uuid_tids
    FROM disk_assessments AS src JOIN assessments AS dest ON (dest.course_instance_id = syncing_course_instance_id AND dest.tid = src.tid AND dest.deleted_at IS NULL)
    WHERE NOT (src.uuid = dest.uuid OR src.uuid IS NULL);
    IF (mismatched_uuid_tids IS NOT NULL) THEN
        RAISE EXCEPTION 'Assertion failure: TIDs on disk with mismatched UUIDs in DB: %', mismatched_uuid_tids;
    END IF;

    -- At this point, there will be exactly one non-deleted row for all tids
    -- that we loaded from disk. It is now safe to update all those rows with
    -- the new information from disk (if we have any).

    FOR valid_assessment IN (
        SELECT tid, data, warnings
        FROM disk_assessments AS src
        WHERE (src.errors IS NULL OR src.errors = '')
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
            max_bonus_points = (valid_assessment.data->>'max_bonus_points')::double precision,
            auto_close = (valid_assessment.data->>'auto_close')::boolean,
            text = valid_assessment.data->>'text',
            assessment_set_id = aggregates.assessment_set_id,
            assessment_module_id = aggregates.assessment_module_id,
            constant_question_value = (valid_assessment.data->>'constant_question_value')::boolean,
            allow_issue_reporting = (valid_assessment.data->>'allow_issue_reporting')::boolean,
            allow_real_time_grading = (valid_assessment.data->>'allow_real_time_grading')::boolean,
            require_honor_code = (valid_assessment.data->>'require_honor_code')::boolean,
            group_work = (valid_assessment.data->>'group_work')::boolean,
            advance_score_perc = (valid_assessment.data->>'advance_score_perc')::double precision,
            sync_errors = NULL,
            sync_warnings = valid_assessment.warnings
        FROM
            (
                SELECT
                    tid,
                    (SELECT id FROM assessment_sets WHERE name = da.data->>'set_name' AND course_id = syncing_course_id) AS assessment_set_id,
                    (SELECT id FROM assessment_modules WHERE name = da.data->>'assessment_module_name' AND course_id = syncing_course_id) AS assessment_module_id
                FROM disk_assessments AS da
            ) AS aggregates
        WHERE
            a.tid = valid_assessment.tid
            AND a.deleted_at IS NULL
            AND a.tid = aggregates.tid
            AND a.course_instance_id = syncing_course_instance_id
        RETURNING id INTO new_assessment_id;
        new_assessment_ids = array_append(new_assessment_ids, new_assessment_id);

        -- if it is a group work try to insert a group_config
        IF (valid_assessment.data->>'group_work')::boolean THEN
            INSERT INTO group_configs (
                course_instance_id,
                assessment_id,
                maximum,
                minimum,
                student_authz_create,
                student_authz_join,
                student_authz_leave,
                has_roles
            ) VALUES (
                syncing_course_instance_id,
                new_assessment_id,
                (valid_assessment.data->>'group_max_size')::bigint,
                (valid_assessment.data->>'group_min_size')::bigint,
                (valid_assessment.data->>'student_group_create')::boolean,
                (valid_assessment.data->>'student_group_join')::boolean,
                (valid_assessment.data->>'student_group_leave')::boolean,
                (valid_assessment.data->>'has_roles')::boolean
            ) ON CONFLICT (assessment_id)
            DO UPDATE
            SET
                maximum = EXCLUDED.maximum,
                minimum = EXCLUDED.minimum,
                student_authz_create = EXCLUDED.student_authz_create,
                student_authz_join = EXCLUDED.student_authz_join,
                student_authz_leave = EXCLUDED.student_authz_leave,
                has_roles = EXCLUDED.has_roles,
                deleted_at = NULL;

            -- Insert all group roles
            FOR group_role IN SELECT * FROM JSONB_ARRAY_ELEMENTS(valid_assessment.data->'groupRoles') LOOP
                INSERT INTO group_roles (
                    role_name,
                    assessment_id,
                    minimum,
                    maximum,
                    can_assign_roles
                ) VALUES (
                    (group_role->>'role_name'),
                    new_assessment_id,
                    -- Insert default values where necessary
                    CASE WHEN group_role ? 'minimum' THEN (group_role->>'minimum')::integer ELSE 0 END,
                    (group_role->>'maximum')::integer,
                    CASE WHEN group_role ? 'can_assign_roles' THEN (group_role->>'can_assign_roles')::boolean ELSE FALSE END
                ) ON CONFLICT (role_name, assessment_id)
                DO UPDATE
                SET
                    role_name = EXCLUDED.role_name,
                    minimum = EXCLUDED.minimum,
                    maximum = EXCLUDED.maximum,
                    can_assign_roles = EXCLUDED.can_assign_roles
                RETURNING group_roles.role_name INTO new_group_role_name;
                new_group_role_names := array_append(new_group_role_names, new_group_role_name);
            END LOOP;

            -- Delete excess group roles
            DELETE FROM group_roles
            WHERE
                assessment_id = new_assessment_id
                AND role_name NOT IN (SELECT unnest(new_group_role_names));

        ELSE
            UPDATE group_configs
            SET deleted_at = now()
            WHERE assessment_id = new_assessment_id;
        END IF;

        -- Now process all access rules for this assessment
        FOR access_rule IN SELECT * FROM JSONB_ARRAY_ELEMENTS(valid_assessment.data->'allowAccess') LOOP
            INSERT INTO assessment_access_rules (
                assessment_id,
                number,
                mode,
                credit,
                uids,
                time_limit_min,
                password,
                seb_config,
                exam_uuid,
                start_date,
                end_date,
                show_closed_assessment,
                show_closed_assessment_score,
                active)
            (
                SELECT
                    new_assessment_id,
                    (access_rule->>'number')::integer,
                    (access_rule->>'mode')::enum_mode,
                    (access_rule->>'credit')::integer,
                    jsonb_array_to_text_array(access_rule->'uids'),
                    (access_rule->>'time_limit_min')::integer,
                    access_rule->>'password',
                    access_rule->'seb_config',
                    (access_rule->>'exam_uuid')::uuid,
                    input_date(access_rule->>'start_date', ci.display_timezone),
                    input_date(access_rule->>'end_date', ci.display_timezone),
                    (access_rule->>'show_closed_assessment')::boolean,
                    (access_rule->>'show_closed_assessment_score')::boolean,
                    (access_rule->>'active')::boolean
                FROM
                    assessments AS a
                    JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
                WHERE
                    a.id = new_assessment_id
            )
            ON CONFLICT (number, assessment_id) DO UPDATE
            SET
                mode = EXCLUDED.mode,
                credit = EXCLUDED.credit,
                time_limit_min = EXCLUDED.time_limit_min,
                password = EXCLUDED.password,
                exam_uuid = EXCLUDED.exam_uuid,
                uids = EXCLUDED.uids,
                seb_config = EXCLUDED.seb_config,
                start_date = EXCLUDED.start_date,
                end_date = EXCLUDED.end_date,
                show_closed_assessment = EXCLUDED.show_closed_assessment,
                show_closed_assessment_score = EXCLUDED.show_closed_assessment_score,
                active = EXCLUDED.active;
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
                best_questions,
                advance_score_perc
            )
            VALUES (
                new_assessment_id,
                (zone->>'number')::integer,
                zone->>'title',
                (zone->>'max_points')::double precision,
                (zone->>'number_choose')::integer,
                (zone->>'best_questions')::integer,
                (zone->>'advance_score_perc')::double precision
            )
            ON CONFLICT (number, assessment_id) DO UPDATE
            SET
                title = EXCLUDED.title,
                max_points = EXCLUDED.max_points,
                number_choose = EXCLUDED.number_choose,
                best_questions = EXCLUDED.best_questions,
                advance_score_perc = EXCLUDED.advance_score_perc
            RETURNING id INTO new_zone_id;

            -- Insert each alternative group in this zone
            FOR alternative_group IN SELECT * FROM JSONB_ARRAY_ELEMENTS(valid_assessment.data->'alternativeGroups'->zone_index) LOOP
                INSERT INTO alternative_groups (
                    number,
                    number_choose,
                    advance_score_perc,
                    assessment_id,
                    zone_id
                ) VALUES (
                    (alternative_group->>'number')::integer,
                    (alternative_group->>'number_choose')::integer,
                    (alternative_group->>'advance_score_perc')::double precision,
                    new_assessment_id,
                    new_zone_id
                ) ON CONFLICT (number, assessment_id) DO UPDATE
                SET
                    number_choose = EXCLUDED.number_choose,
                    zone_id = EXCLUDED.zone_id,
                    advance_score_perc = EXCLUDED.advance_score_perc
                RETURNING id INTO new_alternative_group_id;

                -- Insert an assessment question for each question in this alternative group
                FOR assessment_question IN SELECT * FROM JSONB_ARRAY_ELEMENTS(alternative_group->'questions') LOOP
                    IF (assessment_question->>'has_split_points')::boolean THEN
                        computed_manual_points := (assessment_question->>'manual_points')::double precision;
                        computed_max_auto_points := (assessment_question->>'max_points')::double precision;
                    ELSE
                        SELECT grading_method INTO question_grading_method
                        FROM questions q
                        WHERE q.id = (assessment_question->>'question_id')::bigint;

                        IF FOUND AND question_grading_method = 'Manual' THEN
                            computed_manual_points := (assessment_question->>'max_points')::double precision;
                            computed_max_auto_points := 0;
                        ELSE
                            computed_manual_points := 0;
                            computed_max_auto_points := (assessment_question->>'max_points')::double precision;
                        END IF;
                    END IF;

                    IF (assessment_question->>'question_id')::bigint IS NULL THEN
                        -- During local dev, if a shared question is not present we can insert dummy values
                        -- into the questions table to enable sync success. This code should never
                        -- be reached in production.
                        IF check_sharing_on_sync THEN
                            RAISE EXCEPTION 'Question ID should not be null';
                        END IF;

                        INSERT INTO questions AS dest (course_id, qid, uuid, deleted_at)
                        VALUES (syncing_course_id, null, null, null) RETURNING dest.id INTO new_question_id;
                    ELSE
                        new_question_id := (assessment_question->>'question_id')::bigint;
                    END IF;

                    INSERT INTO assessment_questions AS aq (
                        number,
                        max_points,
                        max_manual_points,
                        max_auto_points,
                        init_points,
                        points_list,
                        force_max_points,
                        tries_per_variant,
                        grade_rate_minutes,
                        deleted_at,
                        assessment_id,
                        question_id,
                        alternative_group_id,
                        number_in_alternative_group,
                        advance_score_perc,
                        effective_advance_score_perc
                    ) VALUES (
                        (assessment_question->>'number')::integer,
                        COALESCE(computed_manual_points, 0) + COALESCE(computed_max_auto_points, 0),
                        COALESCE(computed_manual_points, 0),
                        COALESCE(computed_max_auto_points, 0),
                        (assessment_question->>'init_points')::double precision,
                        jsonb_array_to_double_precision_array(assessment_question->'points_list'),
                        (assessment_question->>'force_max_points')::boolean,
                        (assessment_question->>'tries_per_variant')::integer,
                        (assessment_question->>'grade_rate_minutes')::double precision,
                        NULL,
                        new_assessment_id,
                        new_question_id,
                        new_alternative_group_id,
                        (assessment_question->>'number_in_alternative_group')::integer,
                        (assessment_question->>'advance_score_perc')::double precision,
                        (assessment_question->>'effective_advance_score_perc')::double precision
                    ) ON CONFLICT (question_id, assessment_id) DO UPDATE
                    SET
                        number = EXCLUDED.number,
                        max_points = EXCLUDED.max_points,
                        max_manual_points = EXCLUDED.max_manual_points,
                        max_auto_points = EXCLUDED.max_auto_points,
                        points_list = EXCLUDED.points_list,
                        init_points = EXCLUDED.init_points,
                        force_max_points = EXCLUDED.force_max_points,
                        tries_per_variant = EXCLUDED.tries_per_variant,
                        grade_rate_minutes = EXCLUDED.grade_rate_minutes,
                        deleted_at = EXCLUDED.deleted_at,
                        alternative_group_id = EXCLUDED.alternative_group_id,
                        number_in_alternative_group = EXCLUDED.number_in_alternative_group,
                        question_id = EXCLUDED.question_id,
                        advance_score_perc = EXCLUDED.advance_score_perc,
                        effective_advance_score_perc = EXCLUDED.effective_advance_score_perc
                    RETURNING aq.id INTO new_assessment_question_id;
                    new_assessment_question_ids := array_append(new_assessment_question_ids, new_assessment_question_id);

                    IF (valid_assessment.data->>'group_work')::boolean THEN
                        -- Iterate over all group roles in assessment
                        FOR valid_group_role IN (
                            SELECT gr.id, gr.role_name
                            FROM group_roles as gr
                            WHERE gr.assessment_id = new_assessment_id
                        ) LOOP
                            -- Insert roles that can view
                            INSERT INTO assessment_question_role_permissions (
                                assessment_question_id,
                                group_role_id,
                                can_view
                            ) VALUES (
                                new_assessment_question_id,
                                valid_group_role.id,
                                (valid_group_role.role_name IN (SELECT * FROM JSONB_ARRAY_ELEMENTS_TEXT(assessment_question->'can_view')))
                            ) ON CONFLICT (assessment_question_id, group_role_id)
                            DO UPDATE
                            SET
                                assessment_question_id = EXCLUDED.assessment_question_id,
                                group_role_id = EXCLUDED.group_role_id,
                                can_view = EXCLUDED.can_view;

                            -- Insert roles that can submit
                            INSERT INTO assessment_question_role_permissions (
                                assessment_question_id,
                                group_role_id,
                                can_submit
                            ) VALUES (
                                new_assessment_question_id,
                                valid_group_role.id,
                                (valid_group_role.role_name IN (SELECT * FROM JSONB_ARRAY_ELEMENTS_TEXT(assessment_question->'can_submit')))
                            ) ON CONFLICT (assessment_question_id, group_role_id)
                            DO UPDATE
                            SET
                                assessment_question_id = EXCLUDED.assessment_question_id,
                                group_role_id = EXCLUDED.group_role_id,
                                can_submit = EXCLUDED.can_submit;
                        END LOOP;
                    END IF;
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
        FROM assessments
        WHERE
            course_instance_id = syncing_course_instance_id
            AND deleted_at IS NULL
    ) AS assessments_with_ordinality
    WHERE
        a.tid = assessments_with_ordinality.tid
        AND a.course_instance_id = syncing_course_instance_id;

    -- Second pass: add errors and warnings where needed
    -- Also add an assessment_set_id if we don't have one yet, to
    -- catch cases where we are adding a new assessment set that has
    -- errors and so was skipped above.
    UPDATE assessments AS a
    SET
        sync_errors = da.errors,
        sync_warnings = da.warnings,
        assessment_set_id = COALESCE(a.assessment_set_id,
            (SELECT id FROM assessment_sets WHERE name = 'Unknown' AND course_id = syncing_course_id))
    FROM disk_assessments AS da
    WHERE
        a.tid = da.tid
        AND a.deleted_at IS NULL
        AND a.course_instance_id = syncing_course_instance_id
        AND (da.errors IS NOT NULL AND da.errors != '');

    -- Ensure all assessments have an assessment module. We'll use the "Default"
    -- module if one is not specified. The assessment module syncing code will
    -- ensure that such a module exists.
    UPDATE assessments AS a
    SET
        assessment_module_id = COALESCE(a.assessment_module_id,
            (SELECT id FROM assessment_modules WHERE name = 'Default' AND course_id = syncing_course_id))
    WHERE a.deleted_at IS NULL
    AND a.course_instance_id = syncing_course_instance_id;

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

    -- Internal consistency check. All assessments should have an
    -- assessment set, assessment module, and number.
    SELECT string_agg(a.id::text, ', ')
    INTO bad_assessments
    FROM assessments AS a
    WHERE
        a.deleted_at IS NULL
        AND a.course_instance_id = syncing_course_instance_id
        AND (
            a.assessment_set_id IS NULL
            OR a.number IS NULL
            OR a.assessment_module_id IS NULL
        );
    IF (bad_assessments IS NOT NULL) THEN
        RAISE EXCEPTION 'Assertion failure: Assessment IDs without set, number, or module: %', bad_assessments;
    END IF;
END;
$$ LANGUAGE plpgsql VOLATILE;
