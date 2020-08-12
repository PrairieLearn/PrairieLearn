-- BLOCK select_course_chunks
SELECT
    chunks.*,
    q.uuid AS question_uuid,
    q.qid AS question_name,
    a.uuid AS assessment_uuid,
    a.tid AS assessment_name,
    ci.uuid AS course_instance_uuid,
    ci.short_name AS course_instance_name
FROM
    chunks
    LEFT JOIN assessments AS a ON (a.id = chunks.assessment_id)
    LEFT JOIN course_instances AS ci ON (ci.id = chunks.course_instance_id OR ci.id = a.course_instance_id)
    LEFT JOIN questions AS q ON (q.id = chunks.question_id)
WHERE
    chunks.course_id = $course_id;
