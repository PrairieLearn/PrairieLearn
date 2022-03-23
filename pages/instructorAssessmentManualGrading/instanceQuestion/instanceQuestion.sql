-- BLOCK select_graders
SELECT to_jsonb(course_instances_select_graders($course_instance_id)) AS graders;

-- BLOCK update_assigned_grader
UPDATE instance_questions AS iq
SET
    requires_manual_grading = CASE WHEN $assigned_grader::BIGINT IS NOT NULL THEN TRUE ELSE requires_manual_grading END,
    assigned_grader = $assigned_grader
WHERE
    iq.id = $instance_question_id
    AND ($assigned_grader::BIGINT IS NULL
         OR $assigned_grader IN (SELECT user_id FROM UNNEST(course_instances_select_graders($course_instance_id))));
