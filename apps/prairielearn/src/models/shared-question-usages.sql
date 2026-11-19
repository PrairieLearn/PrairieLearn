-- BLOCK insert_shared_question_usages
WITH RECURSIVE
  -- Retain deleted and same-course intermediaries; match the 20-link adoption bound.
  ancestry AS (
    SELECT
      id,
      course_id,
      copied_from_question_id,
      1 AS depth
    FROM
      questions
    WHERE
      id = $copied_from_question_id
    UNION ALL
    SELECT
      q.id,
      q.course_id,
      q.copied_from_question_id,
      ancestry.depth + 1
    FROM
      ancestry
      JOIN questions q ON q.id = ancestry.copied_from_question_id
    WHERE
      ancestry.depth < 20
  ),
  participants AS (
    SELECT
      a.course_instance_id,
      ai.assessment_id,
      coalesce(ai.user_id, tu.user_id) AS user_id
    FROM
      assessment_instances ai
      JOIN assessments a ON a.id = ai.assessment_id
      LEFT JOIN team_users tu ON tu.team_id = ai.team_id
    WHERE
      ai.id = $assessment_instance_id
      AND ai.include_in_statistics
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
  ancestry.id,
  $destination_course_id::bigint,
  p.course_instance_id,
  p.assessment_id,
  p.user_id
FROM
  ancestry
  CROSS JOIN participants p
WHERE
  ancestry.course_id != $destination_course_id
  AND p.user_id IS NOT NULL
  -- Order conflicting keys consistently across concurrent submissions.
ORDER BY
  ancestry.id,
  p.user_id
ON CONFLICT DO NOTHING;
