-- BLOCK setup_test_data
WITH
  setup_user AS (
    INSERT INTO
      users (user_id, uid, name)
    VALUES
      (1, 'test@example.com', 'Test User')
    RETURNING
      user_id
  ),
  setup_course AS (
    INSERT INTO
      pl_courses (id, short_name, title, display_timezone, path, repository)
    VALUES
      (
        1,
        'TEST',
        'Test Course',
        'America/Chicago',
        '/test/course',
        'test-repo'
      )
    RETURNING
      id AS course_id
  ),
  setup_course_instance AS (
    INSERT INTO
      course_instances (
        id,
        course_id,
        short_name,
        long_name,
        display_timezone,
        enrollment_code
      )
    SELECT
      1,
      course_id,
      'Sp25',
      'Spring 2025',
      'America/Chicago',
      'TEST001'
    FROM
      setup_course
    RETURNING
      id AS course_instance_id
  ),
  setup_assessment_set AS (
    INSERT INTO
      assessment_sets (
        id,
        course_id,
        abbreviation,
        color,
        heading,
        name,
        number
      )
    SELECT
      1,
      course_id,
      'HW',
      'green1',
      'Homeworks',
      'Homework',
      1
    FROM
      setup_course
    RETURNING
      id AS assessment_set_id
  ),
  setup_question AS (
    INSERT INTO
      questions (id, course_id, qid, title, type, grading_method)
    SELECT
      1,
      course_id,
      'test-question',
      'Test Question',
      'Freeform',
      'Internal'
    FROM
      setup_course
    RETURNING
      id AS question_id
  )
SELECT
  user_id,
  course_id,
  course_instance_id,
  assessment_set_id,
  question_id
FROM
  setup_user,
  setup_course,
  setup_course_instance,
  setup_assessment_set,
  setup_question;

-- BLOCK create_homework_assessment
INSERT INTO
  assessments (
    id,
    course_instance_id,
    type,
    number,
    title,
    assessment_set_id,
    tid,
    constant_question_value
  )
VALUES
  (
    $assessment_id,
    $course_instance_id,
    'Homework',
    1,
    $title,
    $assessment_set_id,
    $tid,
    $constant_question_value
  )
RETURNING
  *;

-- BLOCK create_exam_assessment
INSERT INTO
  assessments (
    id,
    course_instance_id,
    type,
    number,
    title,
    assessment_set_id,
    tid
  )
VALUES
  (
    $assessment_id,
    $course_instance_id,
    'Exam',
    1,
    $title,
    $assessment_set_id,
    $tid
  )
RETURNING
  *;

-- BLOCK create_assessment_question
INSERT INTO
  assessment_questions (
    id,
    assessment_id,
    question_id,
    number,
    max_points,
    max_auto_points,
    max_manual_points,
    init_points,
    points_list,
    allow_real_time_grading
  )
VALUES
  (
    $assessment_question_id,
    $assessment_id,
    $question_id,
    $number,
    $max_points,
    $max_auto_points,
    $max_manual_points,
    $init_points,
    $points_list::double precision[],
    TRUE
  )
RETURNING
  *;

-- BLOCK create_assessment_instance
INSERT INTO
  assessment_instances (
    id,
    assessment_id,
    user_id,
    mode,
    open,
    auto_close,
    date
  )
VALUES
  (
    $assessment_instance_id,
    $assessment_id,
    $user_id,
    'Exam',
    TRUE,
    FALSE,
    NOW()
  )
RETURNING
  *;

-- BLOCK create_instance_question
INSERT INTO
  instance_questions (
    id,
    assessment_instance_id,
    assessment_question_id,
    number,
    points,
    auto_points,
    manual_points,
    score_perc,
    open,
    status,
    current_value,
    points_list,
    points_list_original,
    highest_submission_score,
    variants_points_list,
    number_attempts
  )
VALUES
  (
    $instance_question_id,
    $assessment_instance_id,
    $assessment_question_id,
    $number,
    COALESCE($points, 0),
    COALESCE($auto_points, 0),
    COALESCE($manual_points, 0),
    COALESCE($score_perc, 0),
    COALESCE($open, TRUE),
    COALESCE($status::enum_instance_question_status, 'unanswered'::enum_instance_question_status),
    $current_value,
    $points_list::double precision[],
    $points_list_original::double precision[],
    $highest_submission_score,
    COALESCE($variants_points_list::double precision[], ARRAY[]::double precision[]),
    COALESCE($number_attempts, 0)
  )
RETURNING
  *;

-- BLOCK create_variant
INSERT INTO
  variants (
    id,
    instance_question_id,
    question_id,
    course_id,
    user_id,
    variant_seed,
    params,
    true_answer,
    options,
    authn_user_id
  )
VALUES
  (
    $variant_id,
    $instance_question_id,
    $question_id,
    $course_id,
    $user_id,
    '12345',
    '{}',
    '{}',
    '{}',
    $authn_user_id
  )
RETURNING
  *;

-- BLOCK create_submission
INSERT INTO
  submissions (
    id,
    variant_id,
    auth_user_id,
    submitted_answer,
    gradable
  )
VALUES
  (
    $submission_id,
    $variant_id,
    $auth_user_id,
    '{}',
    TRUE
  )
RETURNING
  *;

-- BLOCK create_grading_job
INSERT INTO
  grading_jobs (
    id,
    submission_id,
    auth_user_id,
    grading_method,
    graded_at
  )
VALUES
  (
    $grading_job_id,
    $submission_id,
    $auth_user_id,
    'Internal',
    NOW()
  )
RETURNING
  *;

-- BLOCK get_instance_question
SELECT
  *
FROM
  instance_questions
WHERE
  id = $instance_question_id;
