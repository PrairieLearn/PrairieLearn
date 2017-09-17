CREATE OR REPLACE FUNCTION
    check_course_instance_access_rule (
        course_instance_access_rule course_instance_access_rules,
        role enum_role,
        uid text,
        date TIMESTAMP WITH TIME ZONE
    ) RETURNS BOOLEAN AS $$
DECLARE
    available boolean := TRUE;
BEGIN
    IF course_instance_access_rule.role IS NOT NULL THEN
        IF role < course_instance_access_rule.role THEN
            available := FALSE;
        END IF;
    END IF;

    IF course_instance_access_rule.uids IS NOT NULL THEN
        IF uid != ALL (course_instance_access_rule.uids) THEN
            available := FALSE;
        END IF;
    END IF;

    IF course_instance_access_rule.start_date IS NOT NULL THEN
        IF date < course_instance_access_rule.start_date THEN
            available := FALSE;
        END IF;
    END IF;

    IF course_instance_access_rule.end_date IS NOT NULL THEN
        IF date > course_instance_access_rule.end_date THEN
            available := FALSE;
        END IF;
    END IF;

    IF course_instance_access_rule.institution IS NOT NULL THEN
        IF course_instance_access_rule.institution = 'UIUC' THEN
            IF uid !~ '^.+@illinois\.edu' THEN
                available := FALSE;
            END IF;
        END IF;
        IF course_instance_access_rule.institution = 'ZJUI' THEN
            IF uid !~ '^.+@intl\.zju\.edu\.cn' THEN
                available := FALSE;
            END IF;
        END IF;
    END IF;

    RETURN available;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
