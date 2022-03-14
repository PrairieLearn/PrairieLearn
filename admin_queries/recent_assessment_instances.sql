WITH
course_instance_users_with_assessment_instance_counts AS (
    SELECT
        ci.id AS course_instance_id,
        ai.auth_user_id,
        count(*) AS assessment_instance_count
    FROM
        assessment_instances AS ai
        JOIN assessments AS a ON (a.id = ai.assessment_id)
        JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
    WHERE ai.date > now() - $interval::interval
    GROUP BY ci.id, ai.auth_user_id
),
course_instances_with_assessment_instance_counts AS (
    SELECT
        course_instance_id,
        count(*) AS user_count,
        sum(assessment_instance_count) AS assessment_instance_count
    FROM
        course_instance_users_with_assessment_instance_counts
    GROUP BY course_instance_id
)
SELECT
    i.short_name AS institution,
    c.short_name AS course,
    c.id AS course_id,
    ci.short_name AS course_instance,
    ci.id AS course_instance_id,
    ciwaic.user_count,
    ciwaic.assessment_instance_count
FROM
    course_instances_with_assessment_instance_counts AS ciwaic
    JOIN course_instances AS ci ON (ci.id = ciwaic.course_instance_id)
    JOIN pl_courses AS c ON (c.id = ci.course_id)
    JOIN institutions AS i ON (i.id = c.institution_id)
ORDER BY
    ciwaic.assessment_instance_count DESC,
    i.short_name,
    c.short_name,
    ci.short_name,
    ci.id
LIMIT $limit;
