-- BLOCK insert_administrator
INSERT INTO
  administrators (user_id)
VALUES
  ($user_id);

-- BLOCK insert_sharing_set
INSERT INTO
  sharing_sets (course_id, name, description)
VALUES
  ($course_id, $name, 'Questions for tests')
RETURNING
  id;

-- BLOCK insert_sharing_set_course
INSERT INTO
  sharing_set_courses (sharing_set_id, course_id)
VALUES
  ($sharing_set_id, $course_id);

-- BLOCK select_assessment_question
SELECT
  aq.id AS assessment_question_id,
  aq.question_id,
  a.id AS assessment_id
FROM
  assessment_questions AS aq
  JOIN assessments AS a ON (a.id = aq.assessment_id)
  JOIN questions AS q ON (q.id = aq.question_id)
WHERE
  a.course_instance_id = 1
  AND a.tid = $tid
  AND q.qid = $qid;

-- BLOCK insert_sharing_set_question
INSERT INTO
  sharing_set_questions (sharing_set_id, question_id)
VALUES
  ($sharing_set_id, $question_id);

-- BLOCK insert_shared_question_usage
INSERT INTO
  shared_question_usages (
    shared_question_id,
    destination_course_id,
    destination_course_instance_id,
    destination_assessment_id,
    destination_user_id
  )
VALUES
  ($question_id, 1, 1, $assessment_id, 1);

-- BLOCK insert_ai_grading_job
INSERT INTO
  ai_grading_jobs (
    grading_job_id,
    course_id,
    course_instance_id,
    model,
    prompt,
    completion,
    prompt_tokens,
    completion_tokens
  )
SELECT
  gj.id,
  $course_id,
  1,
  'gpt-6-sol',
  '{}'::jsonb,
  '{}'::jsonb,
  100,
  20
FROM
  grading_jobs AS gj
ORDER BY
  gj.id DESC
LIMIT
  1;
