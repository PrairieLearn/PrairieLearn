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
      AND z.number_choose < (
        SELECT
          count(*)
        FROM
          assessment_questions AS aq
          JOIN alternative_groups AS ag ON ag.id = aq.alternative_group_id
          JOIN questions AS q ON q.id = aq.question_id
        WHERE
          ag.zone_id = z.id
          AND aq.deleted_at IS NULL
          AND q.deleted_at IS NULL
      )
  )
  OR EXISTS (
    SELECT
      1
    FROM
      alternative_groups AS ag
    WHERE
      ag.assessment_id = a.id
      AND ag.number_choose < (
        SELECT
          count(*)
        FROM
          assessment_questions AS aq
          JOIN questions AS q ON q.id = aq.question_id
        WHERE
          aq.alternative_group_id = ag.id
          AND aq.deleted_at IS NULL
          AND q.deleted_at IS NULL
      )
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
  to_jsonb(pfq.*) AS print_form_question
FROM
  print_form_questions AS pfq
  JOIN assessment_questions AS aq ON aq.id = pfq.assessment_question_id
  JOIN questions AS q ON q.id = aq.question_id
  JOIN courses AS c ON c.id = q.course_id
WHERE
  pfq.print_form_id = $print_form_id
ORDER BY
  pfq.position;
