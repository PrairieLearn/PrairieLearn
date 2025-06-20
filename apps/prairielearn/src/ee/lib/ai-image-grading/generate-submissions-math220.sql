-- BLOCK select_course_instance_enrollments
SELECT 
    *,
    u.uid as user_uid
FROM 
    enrollments as e
JOIN 
    users as u ON u.user_id = e.user_id
WHERE
    e.course_instance_id = $course_instance_id

-- BLOCK select_instance_questions
SELECT
    *,
    iq.id as instance_question_id,
    q.id as question_id
FROM 
    instance_questions as iq
JOIN
    assessment_questions as aq ON aq.id = iq.assessment_question_id
JOIN
    questions as q ON q.id = aq.question_id
WHERE
    iq.assessment_instance_id = $assessment_instance_id