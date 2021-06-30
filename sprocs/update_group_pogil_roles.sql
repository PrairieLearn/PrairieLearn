DROP FUNCTION IF EXISTS update_group_pogil_roles(text[], bigint[], bigint);
CREATE OR REPLACE FUNCTION update_group_pogil_roles (
    IN arg_group_roles text[],
    IN arg_user_ids bigint[],
    IN arg_group_id bigint
)
RETURNS integer AS $total$
DECLARE
    total integer;
BEGIN
    -- Create temporary table to run constraints on
    DROP TABLE IF EXISTS proposed_roles;
    CREATE TEMP TABLE proposed_roles (
        group_id bigint,
        group_role enum_pogil_role,
        user_id bigint
    );

    -- Insert arguments into temp table
    FOR counter IN 1..3 LOOP
        INSERT INTO proposed_roles VALUES (arg_group_id, arg_group_roles[counter]::enum_pogil_role, arg_user_ids[counter]);
        RAISE NOTICE 'group role: %', arg_group_roles[counter]::enum_pogil_role;
    END LOOP;

    -- 1. TODO: Run constraint checks (i.e. no duplicate roles, etc.)
    -- 2. Delete the role in "user_roles" for every user in that group
    DELETE FROM user_roles WHERE group_id = arg_group_id;

    -- 3. TODO: Insert all new roles
    INSERT INTO user_roles(group_id, pogil_role, user_id) (SELECT * FROM proposed_roles);

    SELECT count(*) into total FROM proposed_roles;

    DROP TABLE proposed_roles;
    
    RETURN total;
END;
$total$ LANGUAGE plpgsql VOLATILE;