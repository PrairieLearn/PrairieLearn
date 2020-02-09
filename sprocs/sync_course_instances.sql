CREATE OR REPLACE FUNCTION
    sync_course_instances(
        IN new_course_instances JSONB,
        IN new_course_id bigint,
        OUT new_course_instance_ids bigint[]
    )
AS $$
DECLARE
    course_instance JSONB;
    new_course_instance_id bigint;
BEGIN
    FOR course_instance IN SELECT * FROM JSONB_ARRAY_ELEMENTS(new_course_instances) LOOP
        INSERT INTO course_instances (
            course_id,
            uuid,
            short_name,
            long_name,
            display_timezone,
            deleted_at
        ) VALUES (
            new_course_id,
            (course_instance->>'uuid')::uuid,
            course_instance->>'short_name',
            course_instance->>'long_name',
            course_instance->>'display_timezone',
            NULL
        )
        ON CONFLICT (course_id, uuid) DO UPDATE
        SET
            short_name = EXCLUDED.short_name,
            long_name = EXCLUDED.long_name,
            display_timezone = EXCLUDED.display_timezone,
            deleted_at = EXCLUDED.deleted_at
        WHERE
            course_instances.course_id = new_course_id
        RETURNING id INTO new_course_instance_id;
        new_course_instance_ids := array_append(new_course_instance_ids, new_course_instance_id);

        INSERT INTO course_instance_access_rules (
            course_instance_id,
            number,
            role,
            uids,
            start_date,
            end_date,
            institution
        ) SELECT
            new_course_instance_id,
            number,
            (access_rule->>'role')::enum_role,
            CASE
                WHEN access_rule->'uids' = null::JSONB THEN NULL
                ELSE (SELECT ARRAY_AGG(uids)::text[] FROM JSONB_ARRAY_ELEMENTS_TEXT(COALESCE(access_rule->>'uids', '[]')::jsonb) uids)::text[]
            END,
            input_date(access_rule->>'start_date', course_instance->>'display_timezone'),
            input_date(access_rule->>'end_date', course_instance->>'display_timezone'),
            access_rule->>'institution'
        FROM JSONB_ARRAY_ELEMENTS(course_instance->'access_rules') WITH ORDINALITY AS t(access_rule, number)
        ON CONFLICT (number, course_instance_id) DO UPDATE
        SET
            role = EXCLUDED.role,
            uids = EXCLUDED.uids,
            start_date = EXCLUDED.start_date,
            end_date = EXCLUDED.end_date,
            institution = EXCLUDED.institution;

        -- Delete excess access rules
        DELETE FROM course_instance_access_rules
        WHERE
            course_instance_id = new_course_instance_id
            AND number > JSONB_ARRAY_LENGTH(course_instance->'access_rules');
    END LOOP;

    -- Soft-delete unused course instances
    UPDATE course_instances AS ci
    SET
        deleted_at = CURRENT_TIMESTAMP
    WHERE
        ci.course_id = new_course_id
        AND ci.deleted_at IS NULL
        AND ci.id NOT IN (SELECT unnest(new_course_instance_ids));
END;
$$ LANGUAGE plpgsql VOLATILE;
