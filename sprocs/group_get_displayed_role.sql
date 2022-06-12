CREATE FUNCTION
    group_get_displayed_role (
        IN user_ids bigint[],
        IN course_instance_id bigint,
        OUT roles text[]
    )
AS $$
DECLARE 
    user_id integer;
BEGIN
    IF user_ids IS NOT NULL THEN
        FOREACH user_id IN ARRAY user_ids
        LOOP
            roles = array_append(roles, users_get_displayed_role(user_id, course_instance_id));
        END LOOP;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE;
