-- BLOCK select_questions_for_new_form
WITH
  ordered_questions AS (
    SELECT
      aq.id AS assessment_question_id,
      (
        row_number() OVER (
          ORDER BY
            z.number,
            CASE
              WHEN a.shuffle_questions THEN random()
              ELSE aq.number
            END,
            aq.id
        )
      )::integer AS position
    FROM
      assessment_questions_select ($assessment_id, ARRAY[]::bigint[]) AS selected
      JOIN assessment_questions AS aq ON aq.id = selected.assessment_question_id
      JOIN alternative_groups AS ag ON ag.id = aq.alternative_group_id
      JOIN zones AS z ON z.id = ag.zone_id
      JOIN assessments AS a ON a.id = aq.assessment_id
    WHERE
      a.deleted_at IS NULL
  )
SELECT
  to_jsonb(aq.*) AS assessment_question,
  to_jsonb(q.*) AS question,
  oq.position,
  CASE
    WHEN a.type = 'Homework' THEN CASE
      WHEN a.shuffle_questions THEN '#' || q.number::text
      ELSE aset.abbreviation || a.number || '.' || oq.position::text
    END
    WHEN a.type = 'Exam' THEN oq.position::text
    ELSE aq.number::text
  END AS question_number
FROM
  ordered_questions AS oq
  JOIN assessment_questions AS aq ON aq.id = oq.assessment_question_id
  JOIN questions AS q ON q.id = aq.question_id
  JOIN assessments AS a ON a.id = aq.assessment_id
  JOIN assessment_sets AS aset ON aset.id = a.assessment_set_id
ORDER BY
  oq.position;
