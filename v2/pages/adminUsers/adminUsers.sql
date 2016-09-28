-- BLOCK select_and_auth
SELECT
    to_jsonb(c) AS course,
    to_jsonb(ci) AS course_instance,
    to_jsonb(aaci) AS auth,
    to_jsonb(auth_u) AS auth_user,
    to_jsonb(auth_e) AS auth_enrollment,
    all_courses(auth_u.id) AS all_courses,
    all_course_instances(c.id, auth_u.id) AS all_course_instances
FROM
    course_instances AS ci
    JOIN courses AS c ON (c.id = ci.course_id)
    JOIN LATERAL auth_admin_course_instance(ci.id, 'View', $auth_data) AS aaci ON TRUE
    JOIN users AS auth_u ON (auth_u.id = aaci.auth_user_id)
    JOIN enrollments AS auth_e ON (auth_e.user_id = auth_u.id AND auth_e.course_instance_id = ci.id)
WHERE
    ci.id = $course_instance_id
    AND aaci.authorized;

-- BLOCK course_assessments
SELECT
    a.id,a.number AS assessment_number,
    aset.number AS assessment_set_number,aset.color,
    (aset.abbrev || a.number) AS label
FROM assessments AS a
JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
WHERE a.deleted_at IS NULL
AND a.course_instance_id = $course_instance_id
ORDER BY (aset.number, a.number);

-- BLOCK user_scores
WITH
course_users AS (
    SELECT u.id,u.uid,u.name AS user_name,e.role
    FROM users AS u
    JOIN enrollments AS e ON (e.user_id = u.id)
    WHERE e.course_instance_id = $course_instance_id
),
course_assessments AS (
    SELECT a.id,a.number AS assessment_number,aset.number AS assessment_set_number
    FROM assessments AS a
    JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
    WHERE a.deleted_at IS NULL
    AND a.course_instance_id = $course_instance_id
),
scores AS (
    SELECT u.id AS user_id,u.uid,u.user_name,u.role,
        a.id AS assessment_id,a.assessment_number,a.assessment_set_number,
        uas.score_perc
    FROM course_users AS u
    CROSS JOIN course_assessments AS a
    LEFT JOIN user_assessment_scores AS uas ON (uas.assessment_id = a.id AND uas.user_id = u.id)
)
SELECT user_id,uid,user_name,role,
    ARRAY_AGG(score_perc
          ORDER BY (assessment_set_number, assessment_number)
    ) AS scores
FROM scores
GROUP BY user_id,uid,user_name,role
ORDER BY role DESC, uid;
