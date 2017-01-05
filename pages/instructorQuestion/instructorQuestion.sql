-- BLOCK select_and_auth
SELECT
    to_jsonb(q) AS question,
    to_jsonb(c) AS course,
    to_jsonb(ci) AS course_instance,
    to_jsonb(aaci) AS auth,
    to_jsonb(auth_u) AS auth_user,
    to_jsonb(auth_e) AS auth_enrollment
FROM
    questions AS q,
    course_instances AS ci
    JOIN courses AS c ON (c.id = ci.course_id)
    JOIN LATERAL auth_instructor_course_instance(ci.id, 'View', $auth_data) AS aaci ON TRUE
    JOIN users AS auth_u ON (auth_u.id = aaci.auth_user_id)
    JOIN enrollments AS auth_e ON (auth_e.user_id = auth_u.id AND auth_e.course_instance_id = ci.id)
WHERE
    q.id = $question_id
    AND ci.id = $course_instance_id
    AND q.course_id = c.id
    AND aaci.authorized;

-- BLOCK select_question
SELECT
    q.*,
    to_json(top) AS topic,
    tags_for_question(q.id) AS tags,
    assessments_for_question(q.id, $2) AS assessments
FROM questions as q
JOIN topics as top ON (top.id = q.topic_id)
AND q.id = $1
AND q.deleted_at IS NULL;
