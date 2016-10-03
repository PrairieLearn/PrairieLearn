DROP FUNCTION IF EXISTS check_assessment_access(integer,enum_mode,enum_role,character varying,timestamp with time zone);

CREATE OR REPLACE FUNCTION
    check_assessment_access (
        assessment_id integer,
        mode enum_mode,
        role enum_role,
        uid varchar(255),
        date TIMESTAMP WITH TIME ZONE
    ) RETURNS TABLE (
        authorized boolean,      -- Is this assessment available for the given user?
        credit integer,          -- How much credit will they receive?
        credit_date_string TEXT, -- For display to the user.
        access_rules JSONB       -- For display to the user. The currently active rule is marked by 'active' = TRUE.
    ) AS $$
WITH
chosen_access_rule AS (
    -- Choose the access rule which grants access ('authorized' is TRUE), if any, and has the highest 'credit'.
    SELECT
        caar.authorized,
        aar.credit,
        CASE
            WHEN aar.credit > 0 THEN
                aar.credit::text || '%'
                || (CASE WHEN aar.end_date IS NOT NULL
                        THEN ' until ' || to_char(aar.end_date, 'FMHH:MIam Dy, Mon FMDD')
                    END)
            ELSE 'None'
        END AS credit_date_string,
        aar.id
    FROM
        assessment_access_rules AS aar
        JOIN LATERAL check_assessment_access_rule(aar, check_assessment_access.mode, check_assessment_access.role,
            check_assessment_access.uid, check_assessment_access.date, TRUE) AS caar ON TRUE
    WHERE
        aar.assessment_id = check_assessment_access.assessment_id
        AND caar.authorized
    ORDER BY
        aar.credit DESC NULLS LAST,
        aar.number
    LIMIT 1
),
rules_authorized_on_some_date AS (
    -- List of all access rules that will grant access to this user/mode/role at some date (past or future),
    -- computed by ignoring the date argument.
    SELECT
        aar.*
    FROM
        assessment_access_rules AS aar
        JOIN LATERAL check_assessment_access_rule(aar, check_assessment_access.mode, check_assessment_access.role,
            check_assessment_access.uid, NULL, FALSE) AS caar ON TRUE
    WHERE
        aar.assessment_id = check_assessment_access.assessment_id
        AND caar.authorized
)
SELECT
    car.authorized,
    car.credit,
    car.credit_date_string,
    raosd_agg.access_rules
FROM
    chosen_access_rule AS car,
    LATERAL (
        SELECT
            jsonb_agg(jsonb_build_object(
                'credit', CASE WHEN credit IS NOT NULL THEN raosd.credit::text || '%' ELSE 'None' END,
                'start_date', CASE WHEN start_date IS NOT NULL THEN to_char(start_date, 'YYYY-MM-DD HH24:MI') ELSE '—' END,
                'end_date', CASE WHEN end_date IS NOT NULL THEN to_char(end_date, 'YYYY-MM-DD HH24:MI') ELSE '—' END,
                'active', car.id = raosd.id
            ) ORDER BY raosd.number)
        FROM
            rules_authorized_on_some_date AS raosd
    ) AS raosd_agg (access_rules)
$$ LANGUAGE SQL;
