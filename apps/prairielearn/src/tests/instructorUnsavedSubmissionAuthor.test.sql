-- BLOCK select_instance_question
SELECT
  iq.id
FROM
  instance_questions AS iq
  JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
  JOIN questions AS q ON (q.id = aq.question_id)
WHERE
  iq.assessment_instance_id = $assessment_instance_id
  AND q.qid = 'addNumbers';

-- BLOCK select_draft_id
SELECT
  id
FROM
  unsaved_submissions
WHERE
  instance_question_id = $instance_question_id
  AND user_id = $user_id;

-- BLOCK select_submission
SELECT
  *
FROM
  submissions
WHERE
  id = $submission_id;

-- BLOCK select_submission_activity_users
SELECT
  user_id
FROM
  course_instance_usages
WHERE
  course_instance_id = $course_instance_id
  AND type = 'Submission'
  AND user_id = ANY ($user_ids);
