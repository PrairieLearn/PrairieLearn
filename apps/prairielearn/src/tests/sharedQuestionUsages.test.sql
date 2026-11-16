-- BLOCK insert_fixture
INSERT INTO
  users (id, uid)
VALUES
  (1, 'student'),
  (2, 'group-member'),
  (3, 'staff');

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
  (1, 2, 'destination', 'UTC', 'destination');

INSERT INTO
  questions (id, course_id)
VALUES
  (1, 1);

INSERT INTO
  assessments (id, course_instance_id)
VALUES
  (1, 1);

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
  (2, 1, NULL, 1, 1, TRUE),
  (3, 1, 3, NULL, 1, FALSE);

-- BLOCK select_usages
SELECT
  *
FROM
  shared_question_usages
ORDER BY
  destination_user_id;

-- BLOCK delete_history
DELETE FROM teams
WHERE
  id = 1;

DELETE FROM courses
WHERE
  id IN (1, 2);
