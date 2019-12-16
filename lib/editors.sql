-- BLOCK select_assessments_with_question
SELECT
    ci.short_name AS course_instance_directory,
    a.tid AS assessment_directory
FROM
    assessment_questions AS aq
    JOIN assessments AS a ON (a.id = aq.assessment_id)
    JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
WHERE
    aq.question_id = $question_id
    AND aq.deleted_at IS NULL
    AND a.deleted_at IS NULL
    AND ci.deleted_at IS NULL;
