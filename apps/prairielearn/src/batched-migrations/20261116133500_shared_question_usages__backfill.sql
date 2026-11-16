-- BLOCK select_bounds
SELECT
  max(id)
FROM
  instance_questions;

-- BLOCK insert_shared_question_usages
WITH RECURSIVE
  instance_questions_batch AS MATERIALIZED (
    SELECT
      assessment_question_id,
      assessment_instance_id,
      id
    FROM
      instance_questions
    WHERE
      id >= $start
      AND id <= $end
  ),
  context AS MATERIALIZED (
    SELECT DISTINCT
      q.id AS question_id,
      q.course_id AS question_course_id,
      q.copied_from_question_id,
      v.course_id AS destination_course_id,
      a.course_instance_id AS destination_course_instance_id,
      ai.assessment_id AS destination_assessment_id,
      ai.user_id,
      ai.team_id
    FROM
      instance_questions_batch AS iq
      JOIN assessment_questions AS aq ON aq.id = iq.assessment_question_id
      JOIN questions AS q ON q.id = aq.question_id
      JOIN assessment_instances AS ai ON ai.id = iq.assessment_instance_id
      JOIN assessments AS a ON a.id = ai.assessment_id
      CROSS JOIN LATERAL (
        SELECT
          v.course_id
        FROM
          variants AS v
        WHERE
          v.instance_question_id = iq.id
          AND EXISTS (
            SELECT
              1
            FROM
              submissions AS s
            WHERE
              s.variant_id = v.id
          )
        LIMIT
          1
      ) AS v
    WHERE
      ai.include_in_statistics
      AND q.copied_from_question_id IS NOT NULL
  ),
  copied_questions AS (
    SELECT DISTINCT
      question_id,
      question_course_id,
      copied_from_question_id
    FROM
      context
  ),
  -- Resolve ancestry once per distinct question in the batch, not per student.
  ancestry AS (
    SELECT
      q.question_id AS destination_question_id,
      q.question_course_id AS destination_question_course_id,
      q.question_id,
      q.question_course_id AS course_id,
      q.copied_from_question_id,
      0 AS depth
    FROM
      copied_questions AS q
    UNION ALL
    SELECT
      ancestry.destination_question_id,
      ancestry.destination_question_course_id,
      q.id,
      q.course_id,
      q.copied_from_question_id,
      ancestry.depth + 1
    FROM
      ancestry
      JOIN questions AS q ON q.id = ancestry.copied_from_question_id
    WHERE
      ancestry.depth < 20
  ),
  attribution AS (
    SELECT DISTINCT
      destination_question_id,
      question_id
    FROM
      ancestry
    WHERE
      depth > 0
      AND course_id != destination_question_course_id
  ),
  participants AS (
    SELECT
      c.*,
      c.user_id AS counted_user_id
    FROM
      context AS c
    WHERE
      c.user_id IS NOT NULL
    UNION ALL
    -- Historical membership cannot be reconstructed; use surviving membership.
    SELECT
      c.*,
      tu.user_id
    FROM
      context AS c
      JOIN team_users AS tu ON tu.team_id = c.team_id
  )
INSERT INTO
  shared_question_usages (
    shared_question_id,
    destination_course_id,
    destination_course_instance_id,
    destination_assessment_id,
    destination_user_id
  )
SELECT DISTINCT
  a.question_id,
  p.destination_course_id,
  p.destination_course_instance_id,
  p.destination_assessment_id,
  p.counted_user_id
FROM
  participants AS p
  JOIN attribution AS a ON a.destination_question_id = p.question_id
ORDER BY
  a.question_id,
  p.counted_user_id,
  p.destination_course_id,
  p.destination_course_instance_id,
  p.destination_assessment_id
ON CONFLICT DO NOTHING;
