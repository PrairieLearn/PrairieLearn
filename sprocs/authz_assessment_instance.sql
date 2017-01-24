DROP FUNCTION IF EXISTS authz_assessment_instance(bigint,jsonb,text);

CREATE OR REPLACE FUNCTION
    authz_assessment_instance (
        IN assessment_instance_id bigint,
        IN authz_data JSONB,
        IN display_timezone text,
        OUT authorized boolean,      -- Is this assessment available for the given user?
        OUT authorized_edit boolean, -- Is this assessment available for editing by the given user?
        OUT credit integer,          -- How much credit will they receive?
        OUT credit_date_string TEXT, -- For display to the user.
        OUT time_limit_min integer,  -- What is the time limit (if any) for this assessment.
        OUT time_limit_expired boolean, -- Is the time limit expired?
        OUT access_rules JSONB       -- For display to the user. The currently active rule is marked by 'active' = TRUE.
    ) AS $$
WITH
assessment_result AS (
    SELECT
        aa.*,
        u.user_id
    FROM
        assessment_instances AS ai
        JOIN assessments AS a ON (a.id = ai.assessment_id)
        JOIN LATERAL authz_assessment(a.id, authz_data, display_timezone) AS aa ON TRUE
        JOIN users AS u ON (u.user_id = ai.user_id)
    WHERE
        ai.id = authz_assessment_instance.assessment_instance_id
),
authz_result AS (
    SELECT
        (assessment_result.authorized
            AND (assessment_result.user_id = (authz_data->'user'->>'user_id')::integer
                    OR (authz_data->>'has_instructor_view')::boolean)
        ) AS authorized
    FROM
        assessment_result
)
SELECT
    authz_result.authorized,
    CASE
        WHEN authz_data->'authn_user'->'user_id' = authz_data->'user'->'user_id' THEN TRUE
        WHEN (authz_data->>'authn_has_instructor_edit')::boolean THEN TRUE
        ELSE FALSE
    END AND authz_result.authorized AS authorized_edit,
    assessment_result.credit,
    assessment_result.credit_date_string,
    assessment_result.time_limit_min,
    CASE
        WHEN ai.date_limit IS NOT NULL AND ai.date_limit < current_timestamp THEN TRUE
        ELSE FALSE
    END AS time_limit_expired,
    assessment_result.access_rules
FROM
    assessment_result,
    authz_result,
    assessment_instances AS ai
WHERE
    ai.id = authz_assessment_instance.assessment_instance_id;
$$ LANGUAGE SQL STABLE;
