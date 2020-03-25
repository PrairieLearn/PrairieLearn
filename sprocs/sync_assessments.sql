CREATE OR REPLACE FUNCTION
    sync_assessments(
        IN assessments JSONB,
        IN course_id bigint,
        IN new_course_instance_id bigint,
        IN check_access_rules_exam_uuid boolean
    ) returns void
AS $$
DECLARE
    assessment JSONB;
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
    -- The outermost structure of the JSON blob is an array of assessments
    FOR assessment IN SELECT * FROM JSONB_ARRAY_ELEMENTS(sync_assessments.assessments) LOOP
        new_assessment_question_ids := array[]::bigint[];

        INSERT INTO assessments
            (uuid,
            tid,
            type,
            number,
            order_by,
            title,
            config,
            multiple_instance,
            shuffle_questions,
            max_points,
            auto_close,
            deleted_at,
            course_instance_id,
            text,
            assessment_set_id,
            constant_question_value,
            allow_issue_reporting,
            allow_real_time_grading)
        (
            SELECT
                (assessment->>'uuid')::uuid,
                assessment->>'tid',
                (assessment->>'type')::enum_assessment_type,
                assessment->>'number',
                (assessment->>'order_by')::integer,
                assessment->>'title',
                assessment->'config',
                (assessment->>'multiple_instance')::boolean,
                (assessment->>'shuffle_questions')::boolean,
                (assessment->>'max_points')::double precision,
                (assessment->>'auto_close')::boolean,
                NULL,
                sync_assessments.new_course_instance_id,
                assessment->>'text',
                (SELECT id FROM assessment_sets WHERE name = assessment->>'set_name' AND assessment_sets.course_id = sync_assessments.course_id),
                (assessment->>'constant_question_value')::boolean,
                (assessment->>'allow_issue_reporting')::boolean,
                (assessment->>'allow_real_time_grading')::boolean
        )
        ON CONFLICT (course_instance_id, uuid) DO UPDATE
        SET
            tid = EXCLUDED.tid,
            type = EXCLUDED.type,
            number = EXCLUDED.number,
            order_by = EXCLUDED.order_by,
            title = EXCLUDED.title,
            config = EXCLUDED.config,
            multiple_instance = EXCLUDED.multiple_instance,
            shuffle_questions = EXCLUDED.shuffle_questions,
            auto_close = EXCLUDED.auto_close,
            max_points = EXCLUDED.max_points,
            deleted_at = EXCLUDED.deleted_at,
            text = EXCLUDED.text,
            assessment_set_id = EXCLUDED.assessment_set_id,
            constant_question_value = EXCLUDED.constant_question_value,
            allow_issue_reporting = EXCLUDED.allow_issue_reporting,
            allow_real_time_grading = EXCLUDED.allow_real_time_grading
        WHERE
            assessments.course_instance_id = sync_assessments.new_course_instance_id
        RETURNING id INTO new_assessment_id;
        new_assessment_ids = array_append(new_assessment_ids, new_assessment_id);

        -- Now process all access rules for this assessment
        FOR access_rule IN SELECT * FROM JSONB_ARRAY_ELEMENTS(assessment->'allowAccess') LOOP
            -- If exam_uuid is specified, ensure that a corresponding PS exam exists
            IF access_rule->'exam_uuid' != NULL AND check_access_rules_exam_uuid THEN
                SELECT 1 FROM exams WHERE uuid = access_rule->>'exam_uuid';
                IF NOT FOUND THEN
                    RAISE EXCEPTION 'Assessment % allowAccess: No such examUuid % found in database. Ensure you copied the correct UUID from the scheduler.', assessment->>'tid', access_rule->>'exam_uuid';
                END IF;
            END IF;

            INSERT INTO assessment_access_rules
                (assessment_id,
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
                end_date,
                show_closed_assessment)
            (
                SELECT
                    new_assessment_id,
                    (access_rule->>'number')::integer,
                    (access_rule->>'mode')::enum_mode,
                    (access_rule->>'role')::enum_role,
                    (access_rule->>'credit')::integer,
                    jsonb_array_to_text_array(access_rule->'uids'),
                    (access_rule->>'time_limit_min')::integer,
                    access_rule->>'password',
                    access_rule->'seb_config',
                    (access_rule->>'exam_uuid')::uuid,
                    input_date(access_rule->>'start_date', ci.display_timezone),
                    input_date(access_rule->>'end_date', ci.display_timezone),
                    (access_rule->>'show_closed_assessment')::boolean
                FROM
                    assessments AS a
                    JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
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
                end_date = EXCLUDED.end_date,
                show_closed_assessment = EXCLUDED.show_closed_assessment;
        END LOOP;

        -- Delete excess access rules
        DELETE FROM assessment_access_rules
        WHERE
            assessment_id = new_assessment_id
            AND number > jsonb_array_length(assessment->'allowAccess');

        -- Insert all zones for this assessment
        zone_index := 0;
        FOR zone IN SELECT * FROM JSONB_ARRAY_ELEMENTS(assessment->'zones') LOOP
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
            FOR alternative_group IN SELECT * FROM JSONB_ARRAY_ELEMENTS(assessment->'alternativeGroups'->zone_index) LOOP
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
                        jsonb_array_to_double_precision_array(assessment_question->'points_list'),
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
            AND number > jsonb_array_length(assessment->'zones');

        -- Delete excess alternative groups for this assessment
        DELETE FROM alternative_groups
        WHERE
            assessment_id = new_assessment_id
            AND ((number < 1) OR (number > (assessment->>'lastAlternativeGroupNumber')::integer));

        -- Soft-delete unused assessment questions
        UPDATE assessment_questions AS aq
        SET
            deleted_at = CURRENT_TIMESTAMP
        WHERE
            aq.assessment_id = new_assessment_id
            AND aq.deleted_at IS NULL
            AND aq.id NOT IN (SELECT unnest(new_assessment_question_ids));
    END LOOP;

    -- Soft-delete unused assessments
    UPDATE assessments AS a
    SET
        deleted_at = CURRENT_TIMESTAMP
    WHERE
        a.course_instance_id = sync_assessments.new_course_instance_id
        AND a.deleted_at IS NULL
        AND a.id NOT IN (SELECT unnest(new_assessment_ids));

    -- Soft-delete unused assessment questions
    UPDATE assessment_questions AS aq
    SET
        deleted_at = CURRENT_TIMESTAMP
    FROM
        assessments AS a
    WHERE
        a.id = aq.assessment_id
        AND a.course_instance_id = sync_assessments.new_course_instance_id
        AND aq.deleted_at IS NULL
        AND a.id NOT IN (SELECT unnest(new_assessment_ids));

    -- Delete unused assessment access rules
    DELETE FROM assessment_access_rules AS aar
    USING assessments AS a
    WHERE
        aar.assessment_id = a.id
        AND a.deleted_at IS NOT NULL
        AND a.course_instance_id = sync_assessments.new_course_instance_id;

    -- Delete unused zones
    DELETE FROM zones AS z
    USING assessments AS a
    WHERE
        z.assessment_id = a.id
        AND a.deleted_at IS NOT NULL
        AND a.course_instance_id = sync_assessments.new_course_instance_id;
END;
$$ LANGUAGE plpgsql VOLATILE;
