CREATE OR REPLACE FUNCTION
    check_course_instance_access (
        course_instance_id bigint,
        role enum_role,
        uid text,
        date TIMESTAMP WITH TIME ZONE
    ) RETURNS BOOLEAN AS $$
SELECT
    CASE
        WHEN check_course_instance_access.role >= 'Instructor' THEN TRUE
        ELSE (
            SELECT
                COALESCE(bool_or(
                    check_course_instance_access_rule(ciar, check_course_instance_access.role,
                        check_course_instance_access.uid, check_course_instance_access.date)
                ), FALSE)
            FROM
                course_instance_access_rules AS ciar
            WHERE
                ciar.course_instance_id = check_course_instance_access.course_instance_id
        )
    END;
$$ LANGUAGE SQL STABLE;
