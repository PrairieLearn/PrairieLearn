-- BLOCK select_assessment
SELECT
    a.id,
    a.course_instance_id
FROM
    assessments a
WHERE
    a.uuid = '02a973ca-bc8d-4360-b5e0-a22abacb401c';

-- BLOCK insert_enrollment
INSERT INTO enrollments (user_id, course_instance_id)
VALUES ($user_id, $course_instance_id);
