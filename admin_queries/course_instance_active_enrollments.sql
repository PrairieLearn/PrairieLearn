WITH
course_instance_user_submission_counts AS (
    SELECT
        ci.id,
        u.user_id,
        count(*) AS submission_count
    FROM
        submissions AS s
        JOIN variants AS v ON (v.id = s.variant_id)
        JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
        JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
        JOIN assessments AS a ON (a.id = ai.assessment_id)
        JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
        JOIN users AS u ON (u.user_id = s.auth_user_id)
        JOIN institutions AS i ON (i.id = u.institution_id)
    WHERE
        ($institution_short_name = '' OR i.short_name = institution_short_name)
        AND s.date > $start_date
        AND s.date < $end_date
    GROUP BY
        ci.id, u.user_id
),
course_instance_student_counts AS (
    SELECT
        ciusc.id,
        count(*) AS student_count
    FROM
        course_instance_user_submission_counts AS ciusc
        JOIN enrollments AS e ON (e.course_instance_id = ciusc.id AND e.user_id = ciusc.user_id)
    WHERE
        NOT users_is_instructor_in_course_instance(e.user_id, ciusc.id)
        AND ciusc.submission_count >= $minimum_submission_count
    GROUP BY
        ciusc.id
)
SELECT
    i.short_name AS institution,
    c.short_name AS course,
    c.id AS course_id,
    ci.short_name AS course_instance,
    ci.id AS course_instance_id,
    cisc.student_count
FROM
    course_instance_student_counts AS cisc
    JOIN course_instances AS ci ON (ci.id = cisc.id)
    JOIN pl_courses AS c ON (c.id = ci.course_id)
    JOIN institutions AS i ON (i.id = c.institution_id)
WHERE
    cisc.student_count >= $minimum_enrollment_count
ORDER BY
    i.short_name,
    c.short_name,
    ci.short_name,
    ci.id;
