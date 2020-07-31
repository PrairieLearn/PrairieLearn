DROP FUNCTION IF EXISTS authz_assessment(bigint,jsonb);
DROP FUNCTION IF EXISTS authz_assessment(bigint,jsonb,text);
DROP FUNCTION IF EXISTS authz_assessment(bigint,jsonb,timestamptz,text);

CREATE OR REPLACE FUNCTION
    authz_assessment (
        IN assessment_id bigint,
        IN authz_data JSONB,
        IN req_date timestamptz,
        IN display_timezone text,
        OUT authorized boolean,      -- Is this assessment available for the given user?
        OUT authorized_edit boolean, -- Is this assessment available for editing by the given user?
        OUT credit integer,          -- How much credit will they receive?
        OUT credit_date_string TEXT, -- For display to the user.
        OUT time_limit_min integer,  -- The time limit (if any) for this assessment.
        OUT password text,           -- The password (if any) for this assessment.
        OUT mode enum_mode,          -- The mode for this assessment.
        OUT seb_config JSONB,        -- The SEB config (if any) for this assessment.
        OUT show_closed_assessment boolean, -- If students can view the assessment after it is closed.
        OUT access_rules JSONB       -- For display to the user. The currently active rule is marked by 'active' = TRUE.
    )
AS $$
DECLARE
    user_result record;
BEGIN
    -- authorization for the effective user
    SELECT *
    INTO user_result
    FROM
        check_assessment_access(
            assessment_id,
            (authz_data->>'mode')::enum_mode,
            (authz_data->>'course_role')::enum_course_role,
            (authz_data->>'course_instance_role')::enum_course_instance_role,
            (authz_data->'user'->>'user_id')::bigint,
            authz_data->'user'->>'uid',
            req_date,
            display_timezone
        );

    -- start with no acccess
    authorized := FALSE;
    authorized_edit := FALSE;

    -- give access if we aren't emulating
    IF authz_data->'authn_user'->'user_id' = authz_data->'user'->'user_id' THEN
        authorized := user_result.authorized;
        authorized_edit := user_result.authorized;
    END IF;

    -- give view access if we are a Student Data Viewer
    IF (authz_data->>'authn_has_course_instance_permission_view')::boolean THEN
        authorized := TRUE;
    END IF;

    -- give edit access if we are a Student Data Editor
    IF (authz_data->>'authn_has_course_instance_permission_edit')::boolean THEN
        authorized_edit := TRUE;
    END IF;

    -- we can't have higher edit access than view access
    authorized_edit := authorized_edit AND authorized;

    -- all other variables are from the effective user authorization
    credit := user_result.credit;
    credit_date_string := user_result.credit_date_string;
    time_limit_min := user_result.time_limit_min;
    password := user_result.password;
    access_rules := user_result.access_rules;
    mode := user_result.mode;
    seb_config := user_result.seb_config;
    show_closed_assessment := user_result.show_closed_assessment;
END;
$$ LANGUAGE plpgsql VOLATILE;
