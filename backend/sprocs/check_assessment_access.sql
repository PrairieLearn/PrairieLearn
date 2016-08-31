CREATE OR REPLACE FUNCTION
    check_assessment_access (
        IN assessment_id integer,
        IN mode enum_mode,
        IN role enum_role,
        IN uid varchar(255),
        IN date TIMESTAMP WITH TIME ZONE,
        OUT available boolean,
        OUT credit integer
    ) AS $$
SELECT
    COALESCE(bool_or(ctar.available), FALSE) AS available,
    COALESCE(max(ctar.credit), 0) AS credit
FROM
    assessment_access_rules AS aar
    JOIN LATERAL (SELECT * FROM check_assessment_access_rule(aar, check_assessment_access.mode, check_assessment_access.role,
        check_assessment_access.uid, check_assessment_access.date)) AS ctar ON TRUE
WHERE
    aar.assessment_id = check_assessment_access.assessment_id
$$ LANGUAGE SQL;
