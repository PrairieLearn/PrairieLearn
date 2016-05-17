CREATE OR REPLACE FUNCTION
    check_test_access (
        IN test_id integer,
        IN mode enum_mode,
        IN role enum_role,
        IN uid varchar(255),
        IN date TIMESTAMP WITH TIME ZONE,
        OUT available boolean,
        OUT credit integer
        ) AS $$
WITH
access_rule_results AS (
    SELECT check_access_rule(ar, check_test_access.mode, check_test_access.role, check_test_access.uid, check_test_access.date)
    FROM access_rules AS ar
    WHERE ar.test_id = test_id
)
SELECT
*
--    COALESCE(bool_or(open), FALSE) AS open,
--    COALESCE(max(credit), 0) AS credit
FROM access_rule_results
--WHERE open
;
$$ LANGUAGE SQL;
