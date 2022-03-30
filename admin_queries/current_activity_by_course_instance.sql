WITH
course_instance_users_with_submission_counts AS (
    SELECT
        ci.id AS course_instance_id,
        s.auth_user_id,
        count(*) AS submission_count
    FROM
        submissions AS s
        JOIN variants AS v ON (v.id = s.variant_id)
        JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
        JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
        JOIN assessments AS a ON (a.id = ai.assessment_id)
        JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
    WHERE s.date > now() - $interval::interval
    GROUP BY ci.id, s.auth_user_id
),
course_instances_with_submission_counts AS (
    SELECT
        course_instance_id,
        count(*) AS user_count,
        sum(submission_count) AS submission_count
    FROM
        course_instance_users_with_submission_counts
    GROUP BY course_instance_id
)
SELECT
    i.short_name AS institution,
    c.short_name AS course,
    c.id AS course_id,
    ci.short_name AS course_instance,
    ci.id AS course_instance_id,
    ciwsc.user_count,
    ciwsc.submission_count
FROM
    course_instances_with_submission_counts AS ciwsc
    JOIN course_instances AS ci ON (ci.id = ciwsc.course_instance_id)
    JOIN pl_courses AS c ON (c.id = ci.course_id)
    JOIN institutions AS i ON (i.id = c.institution_id)
ORDER BY
    ciwsc.submission_count DESC,
    i.short_name,
    c.short_name,
    ci.short_name,
    ci.id
LIMIT $limit;
