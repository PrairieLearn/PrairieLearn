-- BLOCK select_hw1
SELECT
    a.id
FROM
    assessments AS a
    JOIN assessment_sets AS aset ON (aset.id = a.assessment_set_id)
WHERE
    a.course_instance_id = 1
    AND aset.abbreviation = 'HW'
    AND a.number = '1';

-- BLOCK select_assessment_instances
SELECT
    ai.*
FROM
    assessment_instances AS ai;

-- BLOCK select_instance_questions
SELECT
    iq.*,
    q.qid
FROM
    instance_questions AS iq
    JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
    JOIN questions AS q ON (q.id = aq.question_id)
ORDER BY
    aq.number;

-- BLOCK select_last_submission
SELECT *
FROM submissions
ORDER BY date DESC
LIMIT 1;

-- BLOCK update_max_points
UPDATE assessments
SET
    max_points = 13
WHERE
    tid = 'hw1-automaticTestSuite';

-- BLOCK insert_file_fs_iq
INSERT INTO files (user_id, instance_question_id, created_at, created_by, display_filename, storage_filename, type, storage_type)
VALUES(1, $instance_question_id, current_timestamp, 1, $filename, $filepath, 'student_upload', 'FileSystem');

-- BLOCK insert_file_fs_ai
INSERT INTO files (user_id, assessment_id, assessment_instance_id, created_at, created_by, display_filename, storage_filename, type, storage_type)
VALUES(1, $assessment_id, $assessment_instance_id, current_timestamp, 1, $filename, $filepath, 'student_upload', 'FileSystem');


-- BLOCK delete_test_file_fs
DELETE FROM files 
WHERE $filename = display_filename;

-- BLOCK select_first_ai
SELECT *
FROM assessment_instances
LIMIT 1;