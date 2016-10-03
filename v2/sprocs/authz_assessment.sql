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
WITH
authn_result AS (
    SELECT
        *
    FROM
        check_assessment_access(
            assessment_id,
            (authz_data->>'authn_mode')::enum_mode,
            (authz_data->>'authn_role')::enum_role,
            authz_data->'authn_user'->>'uid',
            current_timestamp
        )
),
user_result AS (
    SELECT
        *
    FROM
        check_assessment_access(
            assessment_id,
            (authz_data->>'mode')::enum_mode,
            (authz_data->>'role')::enum_role,
            authz_data->'user'->>'uid',
            current_timestamp
        )
)
SELECT
    (authn_result.authorized AND user_result.authorized) AS authorized,
    user_result.credit,
    user_result.credit_date_string,
    user_result.access_rules
FROM
    authn_result,
    user_result
$$ LANGUAGE SQL;
