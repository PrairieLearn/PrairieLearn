-- BLOCK update_assigned_grader
WITH course_staff AS (
    SELECT
        cp.user_id
    FROM
        assessments AS a
        JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
        JOIN course_instance_permissions AS cip ON (cip.course_instance_id = ci.id)
        JOIN course_permissions AS cp ON (cp.id = cip.course_permission_id)
    WHERE
        a.id = $assessment_id
        AND cip.course_instance_role >= 'Student Data Editor'
)
UPDATE instance_questions AS iq
SET
    requires_manual_grading = CASE WHEN $assigned_grader::BIGINT IS NOT NULL THEN TRUE ELSE requires_manual_grading END,
    assigned_grader = $assigned_grader
WHERE
    iq.id = $instance_question_id
    AND ($assigned_grader::BIGINT IS NULL
         OR EXISTS (SELECT * FROM course_staff AS cs WHERE cs.user_id = $assigned_grader));
