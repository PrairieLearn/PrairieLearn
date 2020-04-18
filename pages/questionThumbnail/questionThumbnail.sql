-- BLOCK questions
SELECT
    q.thumbnail, q.qid
FROM
    questions as q
    LEFT JOIN course_instances AS ci ON (ci.id = $course_instance_id)
    LEFT JOIN pl_courses AS c ON (c.id = $course_id)
WHERE
    q.qid = $question_qid
