DROP FUNCTION IF EXISTS check_course_instance_access_rule(course_instance_access_rules, enum_role, text, timestamptz);
DROP FUNCTION IF EXISTS check_course_instance_access_rule(course_instance_access_rules, enum_role, text, bigint, timestamptz);

CREATE OR REPLACE FUNCTION
    check_course_instance_access_rule (
        course_instance_access_rule course_instance_access_rules,
        role enum_role,
        uid text,
        institution_id bigint,
        date timestamptz
    ) RETURNS boolean AS $$
DECLARE
    available boolean := TRUE;
    user_result record;
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
        IF course_instance_access_rule.institution = 'LTI' THEN
            -- get the uid row from users
            SELECT *
            INTO user_result
            FROM users
            WHERE users.uid = check_course_instance_access_rule.uid;

            -- check if LTI user, check their course instance matches
            IF user_result.provider != 'lti'
               OR user_result.lti_course_instance_id != course_instance_access_rule.course_instance_id THEN
                    available := FALSE;
            END IF;
        ELSIF course_instance_access_rule.institution != 'Any' THEN
            -- check the institutions table
            PERFORM * FROM institutions AS i
            WHERE
                i.id = institution_id
                AND i.short_name = course_instance_access_rule.institution
            ;

            IF NOT FOUND THEN
                available := FALSE;
            END IF;
        END IF;
    END IF;

    RETURN available;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
