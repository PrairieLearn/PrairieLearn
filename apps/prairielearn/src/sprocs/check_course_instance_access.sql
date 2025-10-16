CREATE FUNCTION
    check_course_instance_access (
        course_instance_id bigint,
        uid text,
        user_institution_id bigint,
        date timestamptz
    ) RETURNS boolean AS $$
WITH 
selected_course_instance AS (
    SELECT ci.*
    FROM
        course_instances AS ci
    WHERE ci.id = check_course_instance_access.course_instance_id
),
selected_course AS (
    SELECT c.*
    FROM
        selected_course_instance
        JOIN pl_courses AS c ON (c.id = selected_course_instance.course_id)
),
access_rules_result AS (
    SELECT COALESCE(bool_or(
        check_course_instance_access_rule(ciar,
            check_course_instance_access.uid, 
            check_course_instance_access.user_institution_id,
            selected_course.institution_id, 
            check_course_instance_access.date)
    ), FALSE) AS has_access_via_rule
    FROM
        selected_course
        LEFT JOIN course_instance_access_rules AS ciar ON (
            ciar.course_instance_id = check_course_instance_access.course_instance_id
        )
)
SELECT
    -- Course instance access rules are deprecated in favor of publishing dates,
    -- so we can short-circuit if the publishing dates are set.
    -- Additionally, institution checks are moved to the enrollment system, so this shouldn't check that.
    
    (selected_course_instance.publishing_publish_date IS NOT NULL
    AND selected_course_instance.publishing_publish_date <= check_course_instance_access.date
    AND (
        selected_course_instance.publishing_archive_date IS NULL
        OR selected_course_instance.publishing_archive_date > check_course_instance_access.date
    )) OR
    access_rules_result.has_access_via_rule
FROM
    selected_course_instance,
    selected_course,
    access_rules_result;
$$ LANGUAGE SQL STABLE;
