-- Validates group role assignments according to assessment rules.
-- Returns table of errors if role assignments are invalid, or no rows if role assignments are valid.
CREATE FUNCTION
    group_roles_validate (
        arg_assessment_id bigint,
        role_updates JSONB[],
        arg_user_id bigint,
        arg_authn_user_id bigint
    ) RETURNS TABLE (
        role_name text,
        minimum integer,
        maximum integer,
        num_assigned integer
    )
AS $$
DECLARE
    arg_group_id bigint;
    arg_role_count integer;
BEGIN
    -- Find group id
    SELECT g.id
    INTO arg_group_id
    FROM groups AS g
    JOIN group_configs AS gc ON g.group_config_id = gc.id
    WHERE 
        gc.assessment_id = arg_assessment_id
        AND g.deleted_at IS NULL
        AND gc.deleted_at IS NULL;

    -- Create table for number of each role
    CREATE TEMPORARY TABLE role_counts (
        role_id bigint,
        -- role_name text,
        role_count integer
    ); 

    -- Populate role counts with number of assignments of each role
    FOREACH arg_role_update IN ARRAY role_updates LOOP
        FOR arg_group_role_id IN SELECT * FROM JSONB_ARRAY_ELEMENTS(arg_role_update->'group_role_ids') LOOP
            IF EXISTS (SELECT * FROM role_counts WHERE role_id = arg_group_role_id)
            BEGIN
                UPDATE role_counts
                SET role_count = role_count + 1
                WHERE role_id = arg_group_role_id;
            END
            ELSE
            BEGIN
                INSERT INTO role_counts (role_id, role_count)
                VALUES (arg_group_role_id, 1);
            END
        END LOOP;
    END LOOP;

    CREATE TEMPORARY TABLE group_validation_errors (
        role_name text,
        minimum integer,
        maximum integer,
        num_assigned integer
    );

    -- Check if any roles exceed the max or fall below the min
    FOR maximum, minimum, id, role_name IN
        SELECT gr.maximum, gr.minimum, gr.id, gr.role_name
        FROM group_roles gr
        WHERE gr.assessment_id = arg_assessment_id
    LOOP
        -- Get role count for role
        SELECT rc.role_count INTO arg_role_count
        FROM role_counts rc
        WHERE rc.role_id = id;

        -- Check if role count is in bounds
        IF arg_role_count > maximum OR arg_role_count < minimum
            INSERT INTO group_validation_errors (role_name, minimum, maximum, num_assigned)
            VALUES (role_name, minimum, maximum, arg_role_count);
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql VOLATILE;
