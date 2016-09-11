DROP FUNCTION IF EXISTS check_assessment_access(integer,enum_mode,enum_role,character varying,timestamp with time zone);

CREATE OR REPLACE FUNCTION
    check_assessment_access (
        IN assessment_id integer,
        IN mode enum_mode,
        IN role enum_role,
        IN uid varchar(255),
        IN date TIMESTAMP WITH TIME ZONE,
        OUT available boolean,       -- Is this assessment available for the given user?
        OUT credit integer,          -- How much credit will they receive?
        OUT credit_date_string TEXT, -- For display to the user.
        OUT access_rules JSONB       -- For display to the user. The currently active rule is marked by 'active' = TRUE.
    ) AS $$
WITH
chosen_access_rule AS (
    -- Choose the access rule which grants access ('available' is TRUE), if any, and has the highest 'credit'.
    SELECT
        caar.available,
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
        AND caar.available
    ORDER BY
        aar.credit DESC NULLS LAST,
        aar.number
    LIMIT 1
),
rules_available_on_some_date AS (
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
        AND caar.available
)
SELECT
    car.available,
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
            rules_available_on_some_date AS raosd
    ) AS raosd_agg (access_rules)
$$ LANGUAGE SQL;
