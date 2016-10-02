DROP FUNCTION IF EXISTS authz_assessment(integer, jsonb);

CREATE OR REPLACE FUNCTION
    authz_assessment (
        IN assessment_id integer,
        IN authz_data JSONB,
        OUT authorized boolean,      -- Is this assessment available for the given user?
        OUT credit integer,          -- How much credit will they receive?
        OUT credit_date_string TEXT, -- For display to the user.
        OUT access_rules JSONB       -- For display to the user. The currently active rule is marked by 'active' = TRUE.
    ) AS $$
SELECT
    check_assessment_access(assessment_id, (authz_data->>'mode')::enum_mode, (authz_data->>'role')::enum_role, authz_data->>'uid', current_timestamp);
$$ LANGUAGE SQL;
