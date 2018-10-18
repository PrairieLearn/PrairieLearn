-- BLOCK select_user_scores
WITH
course_assessments AS (
    SELECT
        a.id,
        a.order_by AS assessment_order_by,
        aset.number AS assessment_set_number,
        (aset.abbreviation || a.number) AS label
    FROM assessments AS a
    JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
    WHERE a.deleted_at IS NULL
    AND a.course_instance_id = $course_instance_id
),
course_scores AS (
    SELECT DISTINCT ON (ai.user_id, a.id)
        ai.user_id,
        a.id AS assessment_id,
        ai.score_perc,
        ai.max_points,
        ai.points,
        ai.date AS start_date,
        EXTRACT(EPOCH FROM ai.duration) AS duration_secs,
        ai.id AS assessment_instance_id
    FROM
        assessment_instances AS ai
        JOIN assessments AS a ON (a.id = ai.assessment_id)
    WHERE
        a.course_instance_id = $course_instance_id
    ORDER BY
        ai.user_id, a.id, ai.score_perc DESC, ai.id
),
last_submissions AS (
    SELECT
        ai.id AS assessment_instance_id,
        MAX(s.date) AS last_submission_date
    FROM
        submissions AS s
        JOIN variants AS v ON (v.id = s.variant_id)
        JOIN instance_questions AS iq ON (iq.id = v.instance_question_id)
        JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
        JOIN assessments AS a ON (a.id = ai.assessment_id)
    WHERE
        a.course_instance_id = $course_instance_id
    GROUP BY ai.id
),
user_ids AS (
    (SELECT DISTINCT user_id FROM course_scores)
    UNION
    (SELECT user_id FROM enrollments WHERE course_instance_id = $course_instance_id)
),
course_users AS (
    SELECT
        u.user_id,
        u.uid,
        u.name,
        coalesce(e.role, 'None'::enum_role) AS role
    FROM
        user_ids
        JOIN users AS u ON (u.user_id = user_ids.user_id)
        LEFT JOIN enrollments AS e ON (e.user_id = u.user_id AND e.course_instance_id = $course_instance_id)
),
scores AS (
    SELECT
        u.user_id,
        u.uid,
        u.name,
        u.role,
        a.id AS assessment_id,
        a.label,
        a.assessment_order_by,
        a.assessment_set_number,
        s.score_perc,
        s.max_points,
        s.points,
        s.start_date,
        s.duration_secs,
        s.assessment_instance_id,
        ls.last_submission_date
    FROM
        course_users AS u
        CROSS JOIN course_assessments AS a
        LEFT JOIN course_scores AS s ON (s.user_id = u.user_id AND s.assessment_id = a.id)
        LEFT JOIN last_submissions AS ls ON (ls.assessment_instance_id = s.assessment_instance_id)
)
SELECT
    uid,
    name,
    role,
    ARRAY_AGG(
        json_build_object(
            'label', label,
            'score_perc', score_perc,
            'max_points', max_points,
            'points', points,
            'start_date', start_date,
            'duration_secs', duration_secs,
            'last_submission_date', last_submission_date,
            'assessment_instance_id', assessment_instance_id
        )
        ORDER BY (assessment_set_number, assessment_order_by, assessment_id)
    ) AS assessments
FROM scores
GROUP BY user_id,uid,name,role
ORDER BY role DESC, uid;
