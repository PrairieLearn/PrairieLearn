-- BLOCK select_question_id
SELECT
  id
FROM
  questions
WHERE
  qid = $qid
  AND course_id = 1;

-- BLOCK update_share_publicly
UPDATE questions
SET
  share_publicly = TRUE,
  share_source_publicly = FALSE
WHERE
  id = $question_id;

-- BLOCK update_share_source_publicly
UPDATE questions
SET
  share_source_publicly = TRUE,
  share_publicly = FALSE
WHERE
  id = $question_id;

-- BLOCK update_question_stats_for_course
WITH
  updated AS (
    UPDATE assessment_questions AS aq
    SET
      mean_question_score = $mean_question_score,
      median_question_score = $median_question_score,
      average_number_submissions = $average_number_submissions
    FROM
      assessments AS a
      JOIN course_instances AS ci ON ci.id = a.course_instance_id
    WHERE
      aq.assessment_id = a.id
      AND ci.course_id = $course_id
      AND aq.question_id = $question_id
    RETURNING
      aq.id
  )
SELECT
  count(*)::integer
FROM
  updated;
