-- BLOCK insert_course
INSERT INTO
  courses (
    path,
    short_name,
    title,
    display_timezone,
    institution_id
  )
VALUES
  ($path, $short_name, $title, 'America/Chicago', 1)
RETURNING
  id;

-- BLOCK insert_course_instance
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
    $short_name,
    $long_name,
    'America/Chicago',
    $enrollment_code
  )
RETURNING
  id;

-- BLOCK insert_assessment
INSERT INTO
  assessments (course_instance_id, title, type)
VALUES
  ($course_instance_id, $title, $type)
RETURNING
  id;

-- BLOCK insert_zone
INSERT INTO
  zones (assessment_id, number, title)
VALUES
  ($assessment_id, $number, $title)
RETURNING
  id;

-- BLOCK insert_alternative_group
INSERT INTO
  alternative_groups (assessment_id, zone_id, number)
VALUES
  ($assessment_id, $zone_id, $number)
RETURNING
  id;

-- BLOCK insert_question
INSERT INTO
  questions (course_id, qid, title)
VALUES
  ($course_id, $qid, $title)
RETURNING
  id;

-- BLOCK insert_assessment_question
INSERT INTO
  assessment_questions (
    assessment_id,
    question_id,
    alternative_group_id,
    allow_real_time_grading,
    max_points,
    max_manual_points,
    max_auto_points
  )
VALUES
  (
    $assessment_id,
    $question_id,
    $alternative_group_id,
    TRUE,
    $max_points,
    $max_manual_points,
    $max_auto_points
  )
RETURNING
  id;

-- BLOCK insert_user
INSERT INTO
  users (uid, name, institution_id)
VALUES
  ($uid, $name, 1)
RETURNING
  id;

-- BLOCK insert_assessment_instance
INSERT INTO
  assessment_instances (
    assessment_id,
    user_id,
    number,
    max_points,
    score_perc_pending
  )
VALUES
  ($assessment_id, $user_id, $number, $max_points, 0)
RETURNING
  id;

-- BLOCK insert_manual_instance_questions
INSERT INTO
  instance_questions (
    assessment_instance_id,
    assessment_question_id,
    requires_manual_grading
  )
VALUES
  (
    $assessment_instance_id,
    $assessment_question_id,
    TRUE
  ),
  (
    $zero_max_assessment_instance_id,
    $assessment_question_id,
    TRUE
  );

-- BLOCK insert_auto_instance_questions
INSERT INTO
  instance_questions (
    assessment_instance_id,
    assessment_question_id,
    status,
    auto_points,
    current_value
  )
VALUES
  (
    $assessment_instance_id,
    $assessment_question_id,
    'saved',
    5,
    30
  ),
  (
    $zero_max_assessment_instance_id,
    $assessment_question_id,
    'saved',
    5,
    30
  );

-- BLOCK insert_exam_auto_instance_question
INSERT INTO
  instance_questions (
    assessment_instance_id,
    assessment_question_id,
    status,
    auto_points,
    current_value,
    points_list
  )
VALUES
  (
    $assessment_instance_id,
    $assessment_question_id,
    'saved',
    4,
    10,
    ARRAY[9]::double precision[]
  );

-- BLOCK select_score_perc_pending
SELECT
  score_perc_pending
FROM
  assessment_instances
WHERE
  id = $id;
