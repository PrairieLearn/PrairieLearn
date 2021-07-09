DROP FUNCTION IF EXISTS update_group_pogil_roles(text[], bigint[], bigint);
CREATE OR REPLACE FUNCTION update_group_pogil_roles (
    IN arg_group_roles text[],
    IN arg_user_ids bigint[],
    IN arg_group_id bigint
)
RETURNS boolean AS $success$
DECLARE
    success boolean;
    num_managers bigint;
BEGIN
    DROP TABLE IF EXISTS proposed_roles;
    -- Create temporary table to run constraints on
    CREATE TEMP TABLE proposed_roles (
        group_id bigint,
        group_role enum_pogil_role,
        user_id bigint
    );

    -- Insert arguments into temp table
    -- Ensure every student is assigned to a role
    FOR counter IN 1..ARRAY_LENGTH(arg_group_roles, 1) LOOP
        IF arg_group_roles[counter]::enum_pogil_role = 'None'::enum_pogil_role THEN
            RETURN FALSE;
        END IF;
        INSERT INTO proposed_roles VALUES (arg_group_id, arg_group_roles[counter]::enum_pogil_role, arg_user_ids[counter]);
        RAISE NOTICE 'group role: %', arg_group_roles[counter]::enum_pogil_role;
    END LOOP;

    -- Check that there's exactly 1 manager
    SELECT COUNT(*) INTO num_managers FROM proposed_roles WHERE group_role = 'Manager'::enum_pogil_role;
    IF num_managers <> 1 THEN
        RETURN FALSE;
    END IF;

    -- Delete the role in "user_roles" for every user in that group
    DELETE FROM user_roles WHERE group_id = arg_group_id;

    -- Insert all new roles
    INSERT INTO user_roles(group_id, pogil_role, user_id) (SELECT * FROM proposed_roles);

    DROP TABLE proposed_roles;
    
    RETURN TRUE;
END;
$success$ LANGUAGE plpgsql VOLATILE;
