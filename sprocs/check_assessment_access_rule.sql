DROP FUNCTION IF EXISTS check_assessment_access_rule(assessment_access_rules,enum_mode,enum_role,character varying,timestamp with time zone);
DROP FUNCTION IF EXISTS check_assessment_access_rule(assessment_access_rules,enum_mode,enum_role,character varying,timestamp with time zone,boolean);
DROP FUNCTION IF EXISTS check_assessment_access_rule(assessment_access_rules,enum_mode,enum_role,character varying,timestamp with time zone,OUT boolean);
DROP FUNCTION IF EXISTS check_assessment_access_rule(assessment_access_rules,enum_mode,enum_role,character varying,timestamp with time zone);

CREATE OR REPLACE FUNCTION
    check_assessment_access_rule (
        IN assessment_access_rule assessment_access_rules,
        IN mode enum_mode,
        IN role enum_role,
        IN uid text,
        IN date TIMESTAMP WITH TIME ZONE,
        IN use_date_check BOOLEAN, -- use a separate flag for safety, rather than having 'date = NULL' indicate this
        OUT authorized boolean
    ) AS $$
BEGIN
    authorized := TRUE;

    IF role >= 'Instructor' THEN
        RETURN;
    END IF;

    IF assessment_access_rule.mode IS NOT NULL THEN
        IF mode IS NULL OR mode != assessment_access_rule.mode THEN
            authorized := FALSE;
        END IF;
    END IF;

    IF assessment_access_rule.role IS NOT NULL THEN
        IF role IS NULL OR role < assessment_access_rule.role THEN
            authorized := FALSE;
        END IF;
    END IF;

    IF assessment_access_rule.uids IS NOT NULL THEN
        IF uid IS NULL OR uid != ALL (assessment_access_rule.uids) THEN
            authorized := FALSE;
        END IF;
    END IF;

    IF use_date_check AND assessment_access_rule.start_date IS NOT NULL THEN
        IF date IS NULL OR date < assessment_access_rule.start_date THEN
            authorized := FALSE;
        END IF;
    END IF;

    IF use_date_check AND assessment_access_rule.end_date IS NOT NULL THEN
        IF date IS NULL OR date > assessment_access_rule.end_date THEN
            authorized := FALSE;
        END IF;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE;
