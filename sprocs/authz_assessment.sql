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
        OUT access_rules JSONB       -- For display to the user. The currently active rule is marked by 'active' = TRUE.
    )
AS $$
DECLARE
    authn_result record;
    user_result record;
BEGIN
    -- authorization for the authn_user
    SELECT *
    INTO authn_result
    FROM
        check_assessment_access(
            assessment_id,
            (authz_data->>'authn_mode')::enum_mode,
            (authz_data->>'authn_role')::enum_role,
            (authz_data->'authn_user'->>'user_id')::bigint,
            authz_data->'authn_user'->>'uid',
            req_date,
            display_timezone
        );

    -- authorization for the effective user
    SELECT *
    INTO user_result
    FROM
        check_assessment_access(
            assessment_id,
            (authz_data->>'mode')::enum_mode,
            (authz_data->>'role')::enum_role,
            (authz_data->'user'->>'user_id')::bigint,
            authz_data->'user'->>'uid',
            req_date,
            display_timezone
        );

    -- we need to be authorized for both our authn_user and effective user
    authorized := authn_result.authorized AND user_result.authorized;

    authorized_edit := FALSE;
    IF authz_data->'authn_user'->'user_id' = authz_data->'user'->'user_id' THEN
        -- allow editing if we are not emulating a different user
        -- this is the normal case
        authorized_edit := TRUE;
    END IF;
    IF (authz_data->>'authn_has_instructor_edit')::boolean THEN
        -- also allow editing if we are really an instructor with edit permissions
        authorized_edit := TRUE;
    END IF;

    -- only allow editing if we are authorized to view
    authorized_edit := authorized_edit AND authorized;

    -- all other variables are from the effective user authorization
    credit := user_result.credit;
    credit_date_string := user_result.credit_date_string;
    time_limit_min := user_result.time_limit_min;
    password := user_result.password;
    access_rules := user_result.access_rules;
    mode := user_result.mode;
    seb_config := user_result.seb_config;
END;
$$ LANGUAGE plpgsql VOLATILE;
