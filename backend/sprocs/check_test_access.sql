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
SELECT
    COALESCE(bool_or(ctar.available), FALSE) AS available,
    COALESCE(max(ctar.credit), 0) AS credit
FROM
    test_access_rules AS tar
    JOIN LATERAL (SELECT * FROM check_test_access_rule(tar, check_test_access.mode, check_test_access.role,
        check_test_access.uid, check_test_access.date)) AS ctar ON TRUE
$$ LANGUAGE SQL;
