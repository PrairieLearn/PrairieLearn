CREATE FUNCTION
    check_course_instance_access_rule (
        course_instance_access_rule course_instance_access_rules,
        uid text,
        user_institution_id bigint,
        course_institution_id bigint,
        date timestamptz
    ) RETURNS boolean AS $$
DECLARE
    available boolean := TRUE;
    user_result record;
BEGIN
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
        -- we have an explicit institution restriction

        IF course_instance_access_rule.institution = 'LTI' THEN
            -- get the uid row from users
            SELECT *
            INTO user_result
            FROM users
            WHERE users.uid = check_course_instance_access_rule.uid;

            IF user_result.lti_course_instance_id IS DISTINCT FROM course_instance_access_rule.course_instance_id THEN
                available := FALSE;
            END IF;
        ELSIF course_instance_access_rule.institution != 'Any' THEN
            -- check the institutions table
            PERFORM * FROM institutions AS i
            WHERE
                i.id = user_institution_id
                AND i.short_name = course_instance_access_rule.institution
            ;

            IF NOT FOUND THEN
                available := FALSE;
            END IF;
        END IF;
    ELSE
        -- no explicit institution restriction, so we default to the course institution
        IF user_institution_id != course_institution_id THEN
            available := FALSE;
        END IF;
    END IF;

    RETURN available;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
