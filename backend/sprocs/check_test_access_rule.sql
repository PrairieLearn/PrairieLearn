CREATE OR REPLACE FUNCTION
    check_test_access_rule (
        IN test_access_rule test_access_rules,
        IN mode enum_mode,
        IN role enum_role,
        IN uid varchar(255),
        IN date TIMESTAMP WITH TIME ZONE,
        OUT available boolean,
        OUT credit integer
    ) AS $$
BEGIN
    available := TRUE;
    credit := 0;

    IF test_access_rule.mode IS NOT NULL THEN
        IF mode != test_access_rule.mode THEN
            available := FALSE;
        END IF;
    END IF;

    IF test_access_rule.role IS NOT NULL THEN
        IF role < test_access_rule.role THEN
            available := FALSE;
        END IF;
    END IF;

    IF test_access_rule.uids IS NOT NULL THEN
        IF uid != ALL (test_access_rule.uids) THEN
            available := FALSE;
        END IF;
    END IF;

    IF test_access_rule.start_date IS NOT NULL THEN
        IF date < test_access_rule.start_date THEN
            available := FALSE;
        END IF;
    END IF;

    IF test_access_rule.end_date IS NOT NULL THEN
        IF date > test_access_rule.end_date THEN
            available := FALSE;
        END IF;
    END IF;

    IF test_access_rule.credit IS NOT NULL THEN
        credit := test_access_rule.credit;
    END IF;
END;
$$ LANGUAGE plpgsql;
