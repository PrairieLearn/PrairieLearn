-- BLOCK course_assessments
SELECT
    a.id AS assessment_id,a.number AS assessment_number,
    aset.number AS assessment_set_number,aset.color,
    (aset.abbreviation || a.number) AS label
FROM assessments AS a
JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
WHERE a.deleted_at IS NULL
AND a.course_instance_id = $course_instance_id
ORDER BY (aset.number, a.order_by, a.id);

-- BLOCK user_scores
WITH
course_users AS (
    SELECT u.user_id,u.uid,u.name AS user_name,e.role
    FROM users AS u
    JOIN enrollments AS e ON (e.user_id = u.user_id)
    WHERE e.course_instance_id = $course_instance_id
),
course_assessments AS (
    SELECT a.id,a.order_by AS assessment_order_by,aset.number AS assessment_set_number
    FROM assessments AS a
    JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
    WHERE a.deleted_at IS NULL
    AND a.course_instance_id = $course_instance_id
),
course_scores AS (
    SELECT ai.user_id, a.id AS assessment_id, max(ai.score_perc) AS score_perc
    FROM
        assessment_instances AS ai
        JOIN assessments AS a ON (a.id = ai.assessment_id)
    WHERE
        a.course_instance_id = $course_instance_id
    GROUP BY
        ai.user_id, a.id
),
scores AS (
    SELECT u.user_id,u.uid,u.user_name,u.role,
        a.id AS assessment_id,a.assessment_order_by,a.assessment_set_number,
        s.score_perc
    FROM
        course_users AS u
        CROSS JOIN course_assessments AS a
        LEFT JOIN course_scores AS s ON (s.user_id = u.user_id AND s.assessment_id = a.id)
)
SELECT user_id,uid,user_name,role,
    ARRAY_AGG(score_perc
          ORDER BY (assessment_set_number, assessment_order_by, assessment_id)
    ) AS score_percs
FROM scores
GROUP BY user_id,uid,user_name,role
ORDER BY role DESC, uid;
