DROP FUNCTION check_assessment_access(integer,enum_mode,enum_role,character varying,timestamp with time zone);

CREATE OR REPLACE FUNCTION
    check_assessment_access (
        IN assessment_id integer,
        IN mode enum_mode,
        IN role enum_role,
        IN uid varchar(255),
        IN date TIMESTAMP WITH TIME ZONE,
        OUT available boolean,
        OUT credit integer,
        OUT credit_date_string TEXT
    ) AS $$
SELECT
    caar.available,
    aar.credit,
    CASE
        WHEN aar.credit > 0 THEN
            aar.credit::text || '%'
            || (CASE WHEN aar.end_date IS NOT NULL
                    THEN ' until ' || to_char(aar.end_date, 'FMHH:MIam Dy, Mon FMDD, YYYY')
                END)
        ELSE 'None'
    END
FROM
    assessment_access_rules AS aar
    JOIN LATERAL (
        SELECT * FROM check_assessment_access_rule(aar, check_assessment_access.mode, check_assessment_access.role,
        check_assessment_access.uid, check_assessment_access.date)
    ) AS caar ON TRUE
WHERE
    aar.assessment_id = check_assessment_access.assessment_id
    AND caar.available
ORDER BY
    aar.credit DESC NULLS LAST,
    aar.id
LIMIT 1;
$$ LANGUAGE SQL;
