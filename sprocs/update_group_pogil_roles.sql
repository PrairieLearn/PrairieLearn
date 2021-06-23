DROP FUNCTION IF EXISTS update_group_pogil_roles(text[], integer[], integer);
CREATE OR REPLACE FUNCTION update_group_pogil_roles (
    IN arg_group_roles text[],
    IN arg_user_ids integer[],
    IN arg_group_id integer
)
RETURNS integer AS $total$
DECLARE
    total integer;
BEGIN
    -- 1. Run constraint checks (i.e. no duplicate roles, etc.)

    -- 2. Delete the role in "user_roles" for every user in that group

    -- 3. Insert all new roles
    SELECT count(*) into total FROM users;
    RETURN total;
END;
$total$ LANGUAGE plpgsql VOLATILE;