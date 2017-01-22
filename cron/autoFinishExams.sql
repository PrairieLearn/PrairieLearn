-- BLOCK select_exam_list
WITH
-- start with the set of "open" assessment_instances
open_assessment_instances AS (
    SELECT
        ai.*
    FROM
        assessment_instances AS ai
        JOIN assessments AS a ON (a.id = ai.assessment_id)
    WHERE
        ai.open = true
        AND a.type = 'Exam'
        AND a.auto_close
        AND age(ai.date) > interval '6 hours' -- not required, but will reduce the search size
        AND NOT ai.instructor_opened
),
-- add the date of last activity to each of them (last submission, or the start date)
last_dated_assessment_instances AS (
    SELECT DISTINCT ON (id)
        ai.id,
        coalesce(s.date, ai.date) AS last_active_date, -- if no submissions then use the exam start date
        coalesce(s.mode, ai.mode) AS mode
    FROM
        open_assessment_instances AS ai
        JOIN instance_questions AS iq ON (iq.assessment_instance_id = ai.id)
        JOIN variants AS v ON (v.instance_question_id = iq.id)
        LEFT JOIN submissions AS s ON (s.variant_id = v.id) -- left join in case we have no submissions
    ORDER BY
        id, last_active_date DESC
),
-- only keep assessment_instances with no recent activity
no_activity_assessment_instances AS (
    SELECT
        *
    FROM
        last_dated_assessment_instances
    WHERE
        age(last_active_date) > interval '6 hours'
)
-- determine credit
SELECT
    ai.id AS assessment_instance_id,
    caa.credit,
    naai.last_active_date, -- for logging
    u.user_id, -- for logging
    u.uid AS user_uid -- for logging
FROM
    no_activity_assessment_instances AS naai
    JOIN assessment_instances AS ai ON (ai.id = naai.id)
    JOIN assessments AS a ON (a.id = ai.assessment_id)
    JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
    JOIN users AS u ON (u.user_id = ai.user_id)
    JOIN enrollments AS e ON (e.user_id = u.user_id AND e.course_instance_id = ci.id)
    JOIN LATERAL check_assessment_access(a.id, naai.mode, e.role, u.uid, naai.last_active_date, ci.display_timezone) AS caa ON TRUE;
    -- Don't check access. The submissions were allowed, so grading must be ok.
