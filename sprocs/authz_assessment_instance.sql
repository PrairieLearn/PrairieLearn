CREATE OR REPLACE FUNCTION
    authz_assessment_instance (
        IN assessment_instance_id integer,
        IN authz_data JSONB,
        OUT authorized boolean,      -- Is this assessment available for the given user?
        OUT authorized_edit boolean, -- Is this assessment available for editing by the given user?
        OUT credit integer,          -- How much credit will they receive?
        OUT credit_date_string TEXT, -- For display to the user.
        OUT access_rules JSONB       -- For display to the user. The currently active rule is marked by 'active' = TRUE.
    ) AS $$
WITH
assessment_result AS (
    SELECT
        aa.*,
        u.id AS user_id
    FROM
        assessment_instances AS ai
        JOIN assessments AS a ON (a.id = ai.assessment_id)
        JOIN LATERAL authz_assessment(a.id, authz_data) AS aa ON TRUE
        JOIN users AS u ON (u.id = ai.user_id)
    WHERE
        ai.id = authz_assessment_instance.assessment_instance_id
),
authz_result AS (
    SELECT
        (assessment_result.authorized
            AND (assessment_result.user_id = (authz_data->'user'->>'id')::integer
                    OR (authz_data->>'has_admin_view')::boolean)
        ) AS authorized
    FROM
        assessment_result
)
SELECT
    authz_result.authorized,
    CASE
        WHEN authz_data->'authn_user'->'id' = authz_data->'user'->'id' THEN TRUE
        WHEN (authz_data->>'has_admin_edit')::boolean THEN TRUE
        ELSE FALSE
    END AND authz_result.authorized AS authorized_edit,
    assessment_result.credit,
    assessment_result.credit_date_string,
    assessment_result.access_rules
FROM
    assessment_result,
    authz_result;
$$ LANGUAGE SQL;
