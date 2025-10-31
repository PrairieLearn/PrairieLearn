-- BLOCK select_student_user
SELECT
  *
FROM
  users
WHERE
  uid = 'test_student';

-- BLOCK select_instance_question_addVectors
SELECT
  *
FROM
  instance_questions
WHERE
  question_id = (
    SELECT
      id
    FROM
      questions
    WHERE
      qid = 'addVectors'
  );

-- BLOCK update_course_instance_access_rules
UPDATE course_instance_access_rules
SET
  start_date = $start_date::timestamptz,
  end_date = $end_date::timestamptz
WHERE
  course_instance_id = $course_instance_id;
