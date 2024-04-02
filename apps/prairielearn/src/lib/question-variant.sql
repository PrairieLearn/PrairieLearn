-- BLOCK select_instance_question_data
SELECT
  aq.question_id,
  ai.group_id,
  ai.user_id,
  iq.assessment_instance_id,
  a.course_instance_id,
  iq.open AS instance_question_open,
  ai.open AS assessment_instance_open
FROM
  instance_questions AS iq
  JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
  JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
  JOIN assessments AS a ON (a.id = ai.assessment_id)
WHERE
  iq.id = $instance_question_id;

-- BLOCK next_variant_number
SELECT
  max(v.number) + 1
FROM
  variants AS v
WHERE
  v.instance_question_id = $instance_question_id;

-- BLOCK insert_workspace
INSERT INTO
  workspaces
DEFAULT VALUES
RETURNING
  id;

-- BLOCK insert_variant
WITH
  new_variant AS (
    INSERT INTO
      variants (
        instance_question_id,
        question_id,
        course_instance_id,
        user_id,
        group_id,
        number,
        variant_seed,
        params,
        true_answer,
        options,
        broken,
        broken_at,
        authn_user_id,
        workspace_id,
        course_id,
        client_fingerprint_id
      )
    VALUES
      (
        $instance_question_id,
        $question_id,
        $course_instance_id,
        $user_id,
        $group_id,
        $number,
        $variant_seed,
        $params,
        $true_answer,
        $options,
        $broken,
        CASE
          WHEN $broken THEN NOW()
          ELSE NULL
        END,
        $authn_user_id,
        $workspace_id,
        $course_id,
        $client_fingerprint_id
      )
    RETURNING
      *
  )
SELECT
  v.*,
  format_date_full_compact (
    v.date,
    COALESCE(ci.display_timezone, c.display_timezone)
  ) AS formatted_date
FROM
  new_variant AS v
  JOIN pl_courses AS c ON (c.id = v.course_id)
  LEFT JOIN course_instances AS ci ON (ci.id = v.course_instance_id);

-- BLOCK select_and_lock_assessment_instance_for_instance_question
SELECT
  ai.id
FROM
  instance_questions AS iq
  JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
WHERE
  iq.id = $instance_question_id
FOR NO KEY UPDATE OF
  ai;

-- BLOCK select_variant_for_instance_question
SELECT
  jsonb_set(
    to_jsonb(v.*),
    '{formatted_date}',
    to_jsonb(
      format_date_full_compact (v.date, ci.display_timezone)
    )
  )
FROM
  variants AS v
  JOIN course_instances AS ci ON (ci.id = v.course_instance_id)
WHERE
  v.instance_question_id = $instance_question_id
  AND (
    NOT $require_open
    OR v.open
  )
  AND v.broken_at IS NULL
ORDER BY
  v.date DESC
LIMIT
  1;
