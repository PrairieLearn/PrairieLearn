-- BLOCK select_unsaved_submission
SELECT
  *
FROM
  unsaved_submissions
WHERE
  instance_question_id = $instance_question_id
  AND user_id = $user_id;

-- BLOCK select_latest_submission
SELECT
  *
FROM
  submissions
WHERE
  variant_id = $variant_id
ORDER BY
  id DESC
LIMIT
  1;

-- BLOCK close_assessment_instance
UPDATE assessment_instances
SET
  open = FALSE
WHERE
  id = (
    SELECT
      assessment_instance_id
    FROM
      instance_questions
    WHERE
      id = $instance_question_id
  );

-- BLOCK count_waiting_assessment_locks
SELECT
  count(*)::integer
FROM
  pg_stat_activity
WHERE
  datname = current_database()
  AND wait_event_type = 'Lock'
  AND query LIKE $query_pattern;

-- BLOCK count_parse_issues
SELECT
  count(*)::integer
FROM
  issues
WHERE
  variant_id = $variant_id
  AND instructor_message = 'Error: Fatal recovery parsing issue';

-- BLOCK select_group_instance_question
SELECT
  iq.id
FROM
  instance_questions AS iq
  JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
  JOIN questions AS q ON (q.id = aq.question_id)
WHERE
  iq.assessment_instance_id = $assessment_instance_id
  AND q.qid = 'addNumbers';
