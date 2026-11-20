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
      assessment_questions AS aq
      JOIN alternative_groups AS ag ON ag.id = aq.alternative_group_id
      JOIN zones AS z ON z.id = ag.zone_id
      JOIN assessments AS a ON a.id = aq.assessment_id
    WHERE
      aq.id = ANY ($assessment_question_ids::bigint[])
      AND a.deleted_at IS NULL
  )
SELECT
  to_jsonb(aq.*) AS assessment_question,
  to_jsonb(q.*) AS question,
  oq.position,
  -- Keep in sync with the question_number formatting in sprocs/question_order.sql.
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

-- BLOCK copy_print_form_variant
WITH
  copied_workspace AS (
    INSERT INTO
      workspaces (url_rewrite)
    SELECT
      w.url_rewrite
    FROM
      variants AS v
      JOIN workspaces AS w ON w.id = v.workspace_id
    WHERE
      v.id = $variant_id
    RETURNING
      id
  )
INSERT INTO
  variants (
    instance_question_id,
    question_id,
    course_instance_id,
    user_id,
    team_id,
    number,
    variant_seed,
    params,
    true_answer,
    options,
    preferences,
    broken,
    broken_at,
    broken_by,
    authn_user_id,
    workspace_id,
    course_id,
    client_fingerprint_id
  )
SELECT
  v.instance_question_id,
  v.question_id,
  v.course_instance_id,
  v.user_id,
  v.team_id,
  v.number,
  v.variant_seed,
  v.params,
  v.true_answer,
  v.options,
  v.preferences,
  v.broken,
  v.broken_at,
  v.broken_by,
  v.authn_user_id,
  (
    SELECT
      id
    FROM
      copied_workspace
  ),
  v.course_id,
  v.client_fingerprint_id
FROM
  variants AS v
WHERE
  v.id = $variant_id
RETURNING
  id;
