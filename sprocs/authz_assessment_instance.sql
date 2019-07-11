DROP FUNCTION IF EXISTS authz_assessment_instance(bigint,jsonb);
DROP FUNCTION IF EXISTS authz_assessment_instance(bigint,jsonb,text);
DROP FUNCTION IF EXISTS authz_assessment_instance(bigint,jsonb,timestamp with time zone,text);

CREATE OR REPLACE FUNCTION
    authz_assessment_instance (
        IN assessment_instance_id bigint,
        IN authz_data JSONB,
        IN req_date timestamptz,
        IN display_timezone text,
        OUT authorized boolean,      -- Is this assessment available for the given user?
        OUT authorized_edit boolean, -- Is this assessment available for editing by the given user?
        OUT credit integer,          -- How much credit will they receive?
        OUT credit_date_string TEXT, -- For display to the user.
        OUT time_limit_min integer,  -- Time limit (if any) for this assessment.
        OUT time_limit_expired boolean, -- Is the time limit expired?
        OUT password text,           -- Password (if any) for this assessment.
        OUT mode enum_mode,
        OUT seb_config JSONB,
        OUT access_rules JSONB       -- For display to the user. The currently active rule is marked by 'active' = TRUE.
    )
AS $$
DECLARE
    assessment_instance assessment_instances;
    assessment_result record;
BEGIN
    SELECT ai.*
    INTO assessment_instance
    FROM assessment_instances AS ai
    WHERE ai.id = assessment_instance_id;

    SELECT *
    INTO assessment_result
    FROM authz_assessment(assessment_instance.assessment_id, authz_data, req_date, display_timezone);

    -- take most data directly from the assessment_result
    credit := assessment_result.credit;
    credit_date_string := assessment_result.credit_date_string;
    time_limit_min := assessment_result.time_limit_min;
    password := assessment_result.password;
    access_rules := assessment_result.access_rules;
    mode := assessment_result.mode;
    seb_config := assessment_result.seb_config;

    time_limit_expired := FALSE;
    IF assessment_instance.date_limit IS NOT NULL AND assessment_instance.date_limit < req_date THEN
        time_limit_expired := TRUE;
    END IF;

    -- start with no acccess
    authorized := FALSE;
    authorized_edit := FALSE;

    -- give access if this is our own assessment and we aren't emulating
    IF (authz_data->'user'->>'user_id')::bigint = assessment_instance.user_id THEN
        IF authz_data->'authn_user'->'user_id' = authz_data->'user'->'user_id' THEN
            authorized := TRUE;
            authorized_edit := TRUE;
        END IF;
    END IF;

    -- give access if we are an instructor
    IF (authz_data->>'authn_has_instructor_view')::boolean THEN
        authorized := TRUE;
    END IF;
    IF (authz_data->>'authn_has_instructor_edit')::boolean THEN
        authorized_edit := TRUE;
    END IF;

    -- we can't have higher authz than the assessment
    authorized := authorized AND assessment_result.authorized;
    authorized_edit := authorized_edit AND assessment_result.authorized_edit;

    -- we can't have higher edit access than view access
    authorized_edit := authorized_edit AND authorized;
END;
$$ LANGUAGE plpgsql VOLATILE;
