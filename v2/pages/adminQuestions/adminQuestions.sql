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

-- BLOCK questions
SELECT
    q.*,
    row_to_json(top) AS topic,
    tags_for_question(q.id) AS tags,
    assessments_for_question(q.id, $course_instance_id) AS assessments
FROM
    questions AS q
    JOIN topics AS top ON (top.id = q.topic_id)
WHERE
    q.course_id IN (
        SELECT ci.course_id
        FROM course_instances AS ci
        WHERE ci.id = $course_instance_id
    )
    AND q.deleted_at IS NULL
GROUP BY q.id,top.id
ORDER BY top.number,q.title;

-- BLOCK tags
SELECT tag.name AS name
FROM tags AS tag
WHERE tag.course_id = $course_id
ORDER BY tag.number;

-- BLOCK assessments
SELECT aset.abbrev || a.number AS label
FROM assessments AS a
JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
WHERE a.course_instance_id = $course_instance_id
AND a.deleted_at IS NULL
ORDER BY aset.number,a.number;
