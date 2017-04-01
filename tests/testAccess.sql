
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

-- BLOCK insert_ps_course_link
WITH
insert_course_result AS (
    INSERT INTO courses
            (course_id, pl_course_id)
    VALUES (1, 1)
)
INSERT INTO exams
        (exam_id, course_id)
VALUES (1, 1);

-- BLOCK insert_ps_reservation
INSERT INTO reservations
        (exam_id, user_id, access_start, access_end)
VALUES (1, $user_id, '2000-01-13 14:02:41', '2200-09-04 08:01:43');
