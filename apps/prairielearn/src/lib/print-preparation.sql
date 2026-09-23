-- BLOCK select_has_randomization
SELECT
  a.shuffle_questions IS TRUE
  OR EXISTS (
    SELECT
      1
    FROM
      zones AS z
    WHERE
      z.assessment_id = a.id
      AND z.number_choose IS NOT NULL
  )
  OR EXISTS (
    SELECT
      1
    FROM
      alternative_groups AS ag
    WHERE
      ag.assessment_id = a.id
      AND ag.number_choose IS NOT NULL
  )
  OR EXISTS (
    SELECT
      1
    FROM
      assessment_questions AS aq
      JOIN questions AS q ON q.id = aq.question_id
    WHERE
      aq.assessment_id = a.id
      AND aq.deleted_at IS NULL
      AND q.deleted_at IS NULL
      AND q.single_variant IS DISTINCT FROM TRUE
  )
FROM
  assessments AS a
WHERE
  a.id = $assessment_id;

-- BLOCK select_questions
-- Match the saved form, including questions removed from the current assessment.
SELECT
  to_jsonb(q.*) AS question,
  to_jsonb(c.*) AS course,
  to_jsonb(aq.*) AS assessment_question,
  qo.question_number
FROM
  instance_questions AS iq
  JOIN assessment_questions AS aq ON aq.id = iq.assessment_question_id
  JOIN questions AS q ON q.id = aq.question_id
  JOIN courses AS c ON c.id = q.course_id
  JOIN question_order ($assessment_instance_id) AS qo ON qo.instance_question_id = iq.id
WHERE
  iq.assessment_instance_id = $assessment_instance_id
ORDER BY
  qo.row_order;
