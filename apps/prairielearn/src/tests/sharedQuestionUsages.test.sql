-- BLOCK insert_fixture
INSERT INTO
  users (id, uid)
VALUES
  (1, 'student'),
  (2, 'group-member'),
  (3, 'staff'),
  (4, 'unanswered');

INSERT INTO
  courses (id, path, display_timezone)
VALUES
  (1, '/source', 'UTC'),
  (2, '/destination', 'UTC');

INSERT INTO
  course_instances (
    id,
    course_id,
    short_name,
    display_timezone,
    enrollment_code
  )
VALUES
  (1, 2, 'destination', 'UTC', 'destination'),
  (2, 1, 'source', 'UTC', 'source');

-- source -> deleted same-course intermediary -> copy; plus a direct sibling.
INSERT INTO
  questions (
    id,
    course_id,
    qid,
    type,
    copied_from_question_id,
    deleted_at
  )
VALUES
  (1, 1, 'source', 'Freeform', NULL, NULL),
  (2, 1, 'intermediary', 'Freeform', 1, now()),
  (3, 2, 'copy', 'Freeform', 2, NULL),
  (4, 2, 'sibling', 'Freeform', 1, NULL);

INSERT INTO
  assessments (id, course_instance_id)
VALUES
  (1, 1),
  (2, 1),
  (3, 2);

INSERT INTO
  assessment_questions (
    id,
    question_id,
    assessment_id,
    allow_real_time_grading
  )
VALUES
  (1, 3, 1, FALSE),
  (2, 4, 1, FALSE),
  (3, 4, 2, FALSE),
  (4, 2, 3, FALSE),
  (5, 1, 3, FALSE);

INSERT INTO
  team_configs (id, course_instance_id, assessment_id)
VALUES
  (1, 1, 1);

INSERT INTO
  teams (id, team_config_id, course_instance_id, name)
VALUES
  (1, 1, 1, 'Group');

INSERT INTO
  team_users (team_id, team_config_id, user_id)
VALUES
  (1, 1, 1),
  (1, 1, 2);

INSERT INTO
  assessment_instances (
    id,
    assessment_id,
    user_id,
    team_id,
    number,
    include_in_statistics
  )
VALUES
  (1, 1, 1, NULL, 1, TRUE),
  (2, 2, 1, NULL, 1, TRUE),
  (3, 1, 3, NULL, 1, FALSE),
  (4, 1, NULL, 1, 1, TRUE),
  (5, 3, 3, NULL, 1, TRUE),
  (6, 1, 4, NULL, 1, TRUE);

INSERT INTO
  instance_questions (
    id,
    assessment_question_id,
    assessment_instance_id
  )
VALUES
  (1, 1, 1),
  (2, 2, 1),
  (3, 3, 2),
  (4, 1, 3),
  (5, 4, 5),
  (6, 5, 5),
  (7, 1, 4),
  (9, 1, 6);

-- No variant course-instance ID: recording/backfill must use assessment context.
INSERT INTO
  variants (
    id,
    question_id,
    instance_question_id,
    course_id,
    user_id,
    team_id,
    authn_user_id,
    variant_seed
  )
SELECT
  iq.id,
  aq.question_id,
  iq.id AS instance_question_id,
  ci.course_id,
  ai.user_id,
  ai.team_id,
  3,
  '0'
FROM
  instance_questions AS iq
  JOIN assessment_questions AS aq ON aq.id = iq.assessment_question_id
  JOIN assessment_instances AS ai ON ai.id = iq.assessment_instance_id
  JOIN assessments AS a ON a.id = ai.assessment_id
  JOIN course_instances AS ci ON ci.id = a.course_instance_id;

INSERT INTO
  variants (
    id,
    question_id,
    course_id,
    user_id,
    authn_user_id,
    variant_seed
  )
VALUES
  (8, 3, 2, 3, 3, '0');

-- BLOCK select_variant
SELECT
  *
FROM
  variants
WHERE
  id = $variant_id;

-- BLOCK select_usages
SELECT
  *
FROM
  shared_question_usages
WHERE
  shared_question_id = 1
ORDER BY
  destination_user_id,
  destination_assessment_id;

-- BLOCK insert_saved_submission
INSERT INTO
  submissions (variant_id, auth_user_id, submitted_answer)
VALUES
  ($variant_id, 3, '{}');

-- BLOCK delete_history
DELETE FROM teams
WHERE
  id = 1;

DELETE FROM assessments
WHERE
  id IN (1, 2, 3);

DELETE FROM questions
WHERE
  id IN (1, 3, 4);

-- BLOCK count_submissions
SELECT
  count(*)::int
FROM
  submissions;
