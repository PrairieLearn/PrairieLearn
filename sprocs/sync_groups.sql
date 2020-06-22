-- Accepts a course instance ID and a JSON object specifying the, as an object of
-- group strings as keys for arrays of UIDs, formatted like:
--    {
--        "dres-2x-exams": [
--            "mwest@illinois.edu",
--            "zilles@illinois.edu"
--        ],
--        "dres-1.5x-exams": [
--            "mussulma@illinois.edu",
--            "nwalter2@illinois.edu"
--        ]
--    }
-- Will ensure that users and enrollments exist for all UIDs.

CREATE OR REPLACE FUNCTION
    sync_groups(
        IN instance_groups JSONB,
        IN new_course_instance_id bigint
    ) returns void
AS $$

DECLARE
    group_name text;
    group_members jsonb;
    new_group_id bigint;
    new_uid text;
    new_user_id bigint;
BEGIN

    FOR group_name, group_members IN SELECT * FROM JSONB_EACH(sync_groups.instance_groups) LOOP

        -- Create or update the group
        INSERT INTO groups
            (course_instance_id, name)
        VALUES
            (new_course_instance_id, group_name)
        ON CONFLICT (course_instance_id, name) DO
        UPDATE SET deleted_at = null;

        -- Get the group's ID
        SELECT id INTO new_group_id
        FROM groups AS g
        WHERE
            g.name = group_name
            AND g.course_instance_id = new_course_instance_id;

        -- Delete all group memberships
        DELETE FROM group_users AS gu
        WHERE
            gu.group_id = new_group_id;

        -- Make new group memberships based on json
        FOR new_uid IN SELECT * FROM JSONB_ARRAY_ELEMENTS_TEXT(group_members) LOOP

            -- Create or update user
            INSERT INTO users
                (uid)
            VALUES (new_uid)
            ON CONFLICT (uid) DO NOTHING;

            -- Ensure enrollment for this course instance
            SELECT user_id INTO new_user_id
            FROM users
            WHERE uid = new_uid;

            INSERT INTO enrollments
                (user_id,  course_instance_id, role)
            VALUES (new_user_id, new_course_instance_id, 'Student')
            ON CONFLICT (user_id, course_instance_id) DO NOTHING;

            -- Add user to group
            INSERT INTO group_users
                (group_id, user_id)
            VALUES
                (new_group_id, new_user_id)
            ON CONFLICT (group_id, user_id) DO NOTHING;

        END LOOP;

    END LOOP;

    -- Set deleted_at for groups not specified and not automatically generated
    -- (represented as not having group_config_id = null, for now)
    UPDATE groups AS g
    SET
        deleted_at = CURRENT_TIMESTAMP
    WHERE
        g.course_instance_id = new_course_instance_id
        AND g.deleted_at IS NULL
        AND g.group_config_id IS NULL
        AND g.name NOT IN (SELECT * FROM JSONB_OBJECT_KEYS(instance_groups));

    -- Delete group memberships which no longer exist
    DELETE FROM group_users AS gu
    USING groups AS g
    WHERE
        g.deleted_at IS NOT NULL
        AND g.group_config_id IS NULL
        AND g.id = gu.group_id;

END;
$$ LANGUAGE plpgsql VOLATILE;
