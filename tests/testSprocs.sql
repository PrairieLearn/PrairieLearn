-- BLOCK setup_pspl_link
WITH
setup_pl_course AS (
    INSERT INTO pl_courses (id) VALUES (1)
),
setup_ci AS (
    INSERT INTO course_instances (id, uuid, course_id) VALUES
        (10, 'b3d010d2-dbef-4b5b-ba4d-92f9aea25c8d', 1), -- main
        (11, '5756a615-cdc4-48e6-9836-79fb708a2f55', 1)  -- proficiency
),
setup_ps_courses AS (
    INSERT INTO courses (course_id, pl_course_id, rubric) VALUES
        (21, null, 'previous semester'),
        (22, null, 'main'),
        (23, null, 'proficiency')
),
setup_exams AS (
    INSERT INTO exams (exam_id, course_id, exam_string) VALUES
        (1, 22, 'Main 1'),
        (2, 23, 'Prof 1')
),
setup_users AS (
    INSERT INTO users (user_id, uid) VALUES
        (100, 'student@school.edu'),
        (101, 'ta@school.edu'),
        (102, 'instructor@school.edu')
),
setup_assessments AS (
    INSERT INTO assessments (id, uuid, tid, title, course_instance_id) VALUES
        (200, '423e8913-0608-4c85-9b2e-bca9c81f52d3', 'Exam1tid', 'Exam 1', 10)
),
setup_assessment_access_rule AS (
    INSERT INTO assessment_access_rules (id, assessment_id, mode, start_date, end_date, credit, exam_id) VALUES
        (300, 200, 'Exam', '2010-01-01 00:00:01-00', '2010-12-31 23:59:59-00', 100, null)
)
SELECT true;



-- BLOCK insert_ps_course_link
WITH
insert_course_result AS (
    INSERT INTO courses
            (course_id, pl_course_id, rubric)
    VALUES (1, 1, 'TPL 101')
)
INSERT INTO exams
        (exam_id, course_id, exam_string)
VALUES (1, 1, 'Exam 1');

-- BLOCK delete_ps_course_link
UPDATE courses
SET pl_course_id = NULL;

-- BLOCK insert_ps_reservation
INSERT INTO reservations
        (exam_id, user_id)
VALUES (1, $user_id);

-- BLOCK update_ps_reservation_to_checked_in
UPDATE reservations
SET
    access_start = '2000-01-01 00:00:01',
    access_end = '2200-01-01 00:00:01';

-- BLOCK delete_all_reservations
DELETE FROM reservations;

-- BLOCK delete_access_rules
DELETE FROM assessment_access_rules;

-- BLOCK insert_ps_exam_access_rule
INSERT INTO assessment_access_rules
    (assessment_id, credit, exam_id, number)
VALUES
    ($assessment_id, 100, 1, 100);
