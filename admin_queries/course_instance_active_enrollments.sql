WITH
course_instance_user_instance_question_counts AS (
    SELECT
        ci.id,
        u.user_id,
        count(*) AS instance_question_count
    FROM
        instance_questions AS iq
        JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
        JOIN assessments AS a ON (a.id = ai.assessment_id)
        JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
        JOIN users AS u ON (u.user_id = iq.authn_user_id)
        JOIN institutions AS i ON (i.id = u.institution_id)
    WHERE
        ($institution_short_name = '' OR i.short_name = $institution_short_name)
        AND iq.modified_at > $start_date
        AND iq.modified_at < $end_date
    GROUP BY
        ci.id, u.user_id
),
course_instance_student_counts AS (
    SELECT
        ciuiqc.id,
        count(*) AS student_count
    FROM
        course_instance_user_instance_question_counts AS ciuiqc
        JOIN enrollments AS e ON (e.course_instance_id = ciuiqc.id AND e.user_id = ciuiqc.user_id)
    WHERE
        NOT users_is_instructor_in_course_instance(e.user_id, ciuiqc.id)
        AND ciuiqc.instance_question_count >= $minimum_instance_question_count
    GROUP BY
        ciuiqc.id
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
