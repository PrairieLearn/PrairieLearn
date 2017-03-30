
-- BLOCK select_student_user
SELECT
    u.*
FROM
    users AS u
WHERE
    u.uid = 'student@example.com';

-- BLOCK insert_student_enrollment
INSERT INTO enrollments
        (user_id, course_instance_id, role)
VALUES ($user_id, 1, 'Student');

-- BLOCK select_e1
SELECT
    a.id
FROM
    assessments AS a
    JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
WHERE
    a.course_instance_id = 1
    AND aset.abbreviation = 'E'
    AND a.number = '1';
