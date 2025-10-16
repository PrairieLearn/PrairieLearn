CREATE FUNCTION
    check_course_instance_access (
        course_instance_id bigint,
        uid text,
        user_institution_id bigint,
        date timestamptz
    ) RETURNS boolean AS $$
WITH selected_course AS (
    SELECT c.*
    FROM
        course_instances AS ci
        JOIN pl_courses AS c ON (c.id = ci.course_id)
    WHERE ci.id = check_course_instance_access.course_instance_id
)
SELECT
      -- Course instance access rules are deprecated in favor of publishing dates,
      -- so we can short-circuit if the publishing dates are set.
      -- Additionally, institution checks are moved to the enrollment system, so this shouldn't check that.
      
      (ci.publishing_publish_date IS NOT NULL
      AND ci.publishing_publish_date <= check_course_instance_access.date
      AND (
        ci.publishing_archive_date IS NULL
        OR ci.publishing_archive_date > check_course_instance_access.date
      ) OR
    COALESCE(
    bool_or(
      check_course_instance_access_rule(ciar,
          check_course_instance_access.uid, check_course_instance_access.user_institution_id,
          selected_course.institution_id, check_course_instance_access.date)
    ), FALSE))
FROM
    course_instance_access_rules AS ciar,
    selected_course
WHERE
    ciar.course_instance_id = check_course_instance_access.course_instance_id;
$$ LANGUAGE SQL STABLE;
