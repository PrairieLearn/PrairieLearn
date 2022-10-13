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
    arg_role_update JSONB;
    arg_group_role_id bigint;
    has_assigner_role_before_assessment boolean;
    has_assigner_role_during_assessment boolean;
    minimum integer;
    maximum integer;
    role_name text;
    id bigint;
    can_assign_roles_at_start boolean;
    can_assign_roles_during_assessment boolean;
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
    ) ON COMMIT DROP; 

    -- Populate role counts with number of assignments of each role
    FOREACH arg_role_update IN ARRAY role_updates LOOP
        FOR arg_group_role_id IN SELECT * FROM JSONB_ARRAY_ELEMENTS(arg_role_update->'group_role_ids') LOOP
            IF EXISTS (SELECT * FROM role_counts WHERE role_id = arg_group_role_id) THEN
                UPDATE role_counts
                SET role_count = role_count + 1
                WHERE role_id = arg_group_role_id;
            ELSE
                INSERT INTO role_counts (role_id, role_count)
                VALUES (arg_group_role_id, 1);
            END IF;
        END LOOP;
    END LOOP;

    CREATE TEMPORARY TABLE group_validation_errors (
        role_name text,
        minimum integer,
        maximum integer,
        num_assigned integer
    ) ON COMMIT DROP;

    has_assigner_role_before_assessment := FALSE;
    has_assigner_role_during_assessment := FALSE;

    -- Check if any roles exceed the max or fall below the min
    FOR maximum, minimum, id, role_name, can_assign_roles_at_start, can_assign_roles_during_assessment IN
        SELECT gr.maximum, gr.minimum, gr.id, gr.role_name, gr.can_assign_roles_at_start, gr.can_assign_roles_during_assessment
        FROM group_roles gr
        WHERE gr.assessment_id = arg_assessment_id
    LOOP
        -- Check if role can assign roles before and during assessments
        IF can_assign_roles_at_start = TRUE THEN
            has_assigner_role_before_assessment := TRUE;
        END IF;
        IF can_assign_roles_during_assessment = TRUE THEN
            has_assigner_role_during_assessment := TRUE;
        END IF;

        -- Get role count for role
        SELECT rc.role_count INTO arg_role_count
        FROM role_counts rc
        WHERE rc.role_id = id;
        
        -- If role is missing from counts, there are no assignments
        IF arg_role_count IS NULL THEN
            arg_role_count := 0;
        END IF;

        -- Check if role count is in bounds
        IF arg_role_count > maximum OR arg_role_count < minimum THEN
            INSERT INTO group_validation_errors (role_name, minimum, maximum, num_assigned)
            VALUES (role_name, minimum, maximum, arg_role_count);
        END IF;
    END LOOP;

    -- If no role exists that can assign roles, add errors
    -- FIXME: provide better errors or redesign how errors are returned
    IF has_assigner_role_before_assessment = FALSE THEN
        INSERT INTO group_validation_errors (role_name, minimum, maximum, num_assigned)
        VALUES ("needs assigner before assessment", 0, 0, 0);
    END IF;
    IF has_assigner_role_during_assessment = FALSE THEN
        INSERT INTO group_validation_errors (role_name, minimum, maximum, num_assigned)
        VALUES ("needs assigner during assessment", 0, 0, 0);
    END IF;

    RETURN QUERY (SELECT * FROM group_validation_errors);
END;
$$ LANGUAGE plpgsql VOLATILE;
