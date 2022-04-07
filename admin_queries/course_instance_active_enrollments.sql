WITH
course_instances_initial_selection AS (
    -- First find any course instances with activity in
    -- the given time period.
    SELECT DISTINCT
        ci.id
    FROM
        assessment_instances AS ai
        JOIN assessments AS a ON (a.id = ai.assessment_id)
        JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
        JOIN pl_courses AS c ON (c.id = ci.course_id)
        JOIN institutions AS i ON (i.id = c.institution_id)
    WHERE
        ($institution_short_name = '' OR i.short_name = $institution_short_name)
        AND ai.modified_at BETWEEN $start_date AND $end_date
),
course_instance_user_data AS (
    -- Re-select this to get all course instance data,
    -- not just that from the search date range.
    SELECT
        ci.id,
        u.user_id,
        (i.id = u.institution_id) AS is_institution_user,
        count(*) AS instance_question_count,
        count(*) FILTER (WHERE iq.modified_at BETWEEN $start_date AND $end_date) AS instance_question_within_dates_count,
        min(iq.created_at) AS start_date,
        max(iq.modified_at) AS end_date
    FROM
        course_instances_initial_selection AS ciis
        JOIN course_instances AS ci ON (ci.id = ciis.id)
        JOIN assessments AS a ON (a.course_instance_id = ciis.id)
        JOIN assessment_instances AS ai ON (ai.assessment_id = a.id)
        JOIN instance_questions AS iq ON (iq.assessment_instance_id = ai.id)
        JOIN users AS u ON (u.user_id = iq.authn_user_id)
        JOIN pl_courses AS c ON (c.id = ci.course_id)
        JOIN institutions AS i ON (i.id = c.institution_id)
    GROUP BY
        ci.id, u.user_id, i.id, u.institution_id
),
course_instance_user_selection AS (
    SELECT *
    FROM course_instance_user_data
    WHERE
        NOT users_is_instructor_in_course_instance(user_id, id)
        AND instance_question_count >= $minimum_instance_question_count
),
course_instance_data AS (
    SELECT
        id,
        count(*) AS total_students,
        count(*) FILTER (WHERE NOT is_institution_user) AS outside_students,
        count(*) FILTER (WHERE instance_question_within_dates_count >= $minimum_instance_question_count) AS within_dates_students,
        sum(instance_question_count) AS instance_question_count,
        avg(instance_question_within_dates_count::double precision / instance_question_count::double precision * 100) AS activity_within_dates_perc,
        percentile_disc(0.5) WITHIN GROUP (ORDER BY start_date) AS start_date,
        percentile_disc(0.5) WITHIN GROUP (ORDER BY end_date) AS end_date
    FROM
        course_instance_user_selection
    GROUP BY
        id
)
SELECT
    i.short_name AS institution,
    c.short_name AS course,
    c.id AS course_id,
    ci.short_name AS course_instance,
    ci.id AS course_instance_id,

    -- total number of students in the course instance (over all time)
    cid.total_students,

    -- number of students in the course instance who are from a different institution (over all time)
    cid.outside_students,

    -- average percentage of question activity within the original search date range
    round(cid.activity_within_dates_perc)::integer AS activity_within_dates_perc,

    -- average number of instance questions per student in the course instance (over all students and all time)
    round(cid.instance_question_count::double precision / cid.total_students::double precision)::integer AS questions_per_student,

    -- approximate first date when most students starting working on questions in the course instance (over all students and all time)
    to_char(cid.start_date, 'YYYY-MM-DD') AS start_date,

    -- approximate last date when most students last worked on questions in the course instance (over all students and all time)
    to_char(cid.end_date, 'YYYY-MM-DD') AS end_date,

    -- number of dates from start_date to end_date
    round(extract(epoch from (end_date - start_date))::double precision / (24 * 60 * 60)::double precision)::integer AS duration_days
FROM
    course_instance_data AS cid
    JOIN course_instances AS ci ON (ci.id = cid.id)
    JOIN pl_courses AS c ON (c.id = ci.course_id)
    JOIN institutions AS i ON (i.id = c.institution_id)
WHERE
    cid.within_dates_students >= $minimum_student_count
ORDER BY
    i.short_name,
    c.short_name,
    ci.short_name,
    ci.id;
