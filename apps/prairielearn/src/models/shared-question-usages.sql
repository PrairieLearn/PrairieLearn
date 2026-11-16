-- BLOCK insert_shared_question_usages_for_submission
WITH RECURSIVE
  context AS MATERIALIZED (
    SELECT
      q.id AS question_id,
      q.course_id AS question_course_id,
      q.copied_from_question_id,
      v.course_id AS destination_course_id,
      a.course_instance_id AS destination_course_instance_id,
      ai.assessment_id AS destination_assessment_id,
      ai.user_id,
      ai.team_id
    FROM
      submissions AS s
      JOIN variants AS v ON v.id = s.variant_id
      JOIN questions AS q ON q.id = v.question_id
      JOIN instance_questions AS iq ON iq.id = v.instance_question_id
      JOIN assessment_instances AS ai ON ai.id = iq.assessment_instance_id
      JOIN assessments AS a ON a.id = ai.assessment_id
    WHERE
      s.id = $submission_id
      AND ai.include_in_statistics
      AND q.copied_from_question_id IS NOT NULL
  ),
  -- Match the copy-adoption traversal's 20-link bound. Deleted rows can connect
  -- a source to later copies, so keep them and same-course intermediaries.
  ancestry AS (
    SELECT
      c.question_id,
      c.question_course_id AS course_id,
      c.copied_from_question_id,
      0 AS depth
    FROM
      context AS c
    UNION ALL
    SELECT
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
      ancestry.question_id
    FROM
      ancestry
      CROSS JOIN context AS c
    WHERE
      ancestry.depth > 0
      AND ancestry.course_id != c.question_course_id
  ),
  participants AS (
    SELECT
      user_id
    FROM
      context
    WHERE
      user_id IS NOT NULL
    UNION ALL
    -- Snapshot membership at submission time, rather than joining the current
    -- membership when a report is read. Later submissions can credit new members.
    SELECT
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
SELECT
  a.question_id,
  c.destination_course_id,
  c.destination_course_instance_id,
  c.destination_assessment_id,
  p.user_id
FROM
  attribution AS a
  CROSS JOIN context AS c
  CROSS JOIN participants AS p
  -- Acquire conflicting keys in the same order across concurrent submissions.
ORDER BY
  a.question_id,
  p.user_id
ON CONFLICT DO NOTHING;

-- BLOCK select_shared_question_usage_counts
WITH
  requested AS (
    SELECT DISTINCT
      unnest($question_ids::bigint[]) AS question_id
  )
SELECT
  r.question_id,
  count(DISTINCT u.destination_user_id)::int AS student_count
FROM
  requested AS r
  LEFT JOIN LATERAL (
    SELECT
      u.destination_user_id
    FROM
      shared_question_usages AS u
    WHERE
      u.shared_question_id = r.question_id
    OFFSET
      0
  ) AS u ON TRUE
GROUP BY
  r.question_id
ORDER BY
  r.question_id;
