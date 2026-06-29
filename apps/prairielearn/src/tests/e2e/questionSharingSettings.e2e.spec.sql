-- BLOCK insert_consuming_course
INSERT INTO
  courses (short_name, title, path, display_timezone)
VALUES
  (
    'CONSUMING 101',
    'Consuming course',
    $path,
    'America/Chicago'
  )
RETURNING
  id;

-- BLOCK share_final_exam_set_with_consuming_course
INSERT INTO
  sharing_set_courses (sharing_set_id, course_id)
SELECT
  ss.id,
  $consuming_course_id
FROM
  sharing_sets AS ss
WHERE
  ss.course_id = $test_course_id
  AND ss.name = 'final-exam'
ON CONFLICT DO NOTHING;

-- BLOCK insert_consuming_course_instance
INSERT INTO
  course_instances (
    course_id,
    short_name,
    long_name,
    display_timezone,
    enrollment_code
  )
VALUES
  (
    $course_id,
    'Sp15',
    'Spring 2015',
    'America/Chicago',
    gen_random_uuid()::text
  )
RETURNING
  id;

-- BLOCK insert_consuming_assessment
INSERT INTO
  assessments (course_instance_id, tid, title)
VALUES
  (
    $course_instance_id,
    'shared-question-test',
    'Shared question test'
  )
RETURNING
  id;

-- BLOCK insert_consuming_assessment_question
INSERT INTO
  assessment_questions (
    assessment_id,
    question_id,
    number,
    allow_real_time_grading
  )
VALUES
  ($assessment_id, $question_id, 1, TRUE);

-- BLOCK select_question_used_in_other_course
SELECT
  EXISTS (
    SELECT
      1
    FROM
      assessment_questions AS aq
      JOIN assessments AS a ON a.id = aq.assessment_id
      JOIN course_instances AS ci ON ci.id = a.course_instance_id
    WHERE
      aq.question_id = $question_id
      AND ci.course_id != $test_course_id
      AND aq.deleted_at IS NULL
      AND a.deleted_at IS NULL
      AND ci.deleted_at IS NULL
  );
