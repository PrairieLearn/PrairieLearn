-- BLOCK select_instance_questions_manual_grading
WITH
  issue_count AS (
    SELECT
      i.instance_question_id,
      count(*)::integer AS open_issue_count
    FROM
      issues AS i
    WHERE
      i.assessment_id = $assessment_id
      AND i.course_caused
      AND i.open
    GROUP BY
      i.instance_question_id
  ),
  latest_submissions AS (
    SELECT DISTINCT
      ON (iq.id) iq.id AS instance_question_id,
      s.id AS submission_id,
      s.manual_rubric_grading_id
    FROM
      instance_questions AS iq
      JOIN variants AS v ON iq.id = v.instance_question_id
      JOIN submissions AS s ON v.id = s.variant_id
    WHERE
      iq.assessment_question_id = $assessment_question_id
    ORDER BY
      iq.id ASC,
      s.date DESC
  ),
  rubric_items_agg AS (
    SELECT
      ls.instance_question_id,
      COALESCE(
        json_agg(rgi.rubric_item_id) FILTER (
          WHERE
            rgi.rubric_item_id IS NOT NULL
        ),
        '[]'::json
      ) AS rubric_grading_item_ids
    FROM
      latest_submissions AS ls
      LEFT JOIN rubric_grading_items AS rgi ON (
        rgi.rubric_grading_id = ls.manual_rubric_grading_id
      )
    GROUP BY
      ls.instance_question_id
  )
SELECT
  iq.*,
  ai.open AS assessment_open,
  COALESCE(u.uid, array_to_string(gul.uid_list, ', ')) AS uid,
  COALESCE(agu.name, agu.uid) AS assigned_grader_name,
  COALESCE(lgu.name, lgu.uid) AS last_grader_name,
  to_jsonb(aq.*) AS assessment_question,
  COALESCE(g.name, u.name) AS user_or_group_name,
  ic.open_issue_count,
  -- Pseudo-random deterministic stable order of instance questions. This will
  -- always return the same set of instance questions in the same order, but it
  -- is designed to reduce the impact of the order of the instance questions on
  -- individual students, which reduces bias. See
  -- https://papers.ssrn.com/sol3/papers.cfm?abstract_id=4603146
  ((iq.id % 21317) * 45989) % 3767 AS iq_stable_order,
  COALESCE(ri.rubric_grading_item_ids, '[]'::json) AS rubric_grading_item_ids
FROM
  instance_questions AS iq
  JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
  JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
  LEFT JOIN users AS u ON (u.user_id = ai.user_id)
  LEFT JOIN groups AS g ON (g.id = ai.group_id)
  LEFT JOIN groups_uid_list (g.id) AS gul ON TRUE
  LEFT JOIN users AS agu ON (agu.user_id = iq.assigned_grader)
  LEFT JOIN users AS lgu ON (lgu.user_id = iq.last_grader)
  LEFT JOIN issue_count AS ic ON (ic.instance_question_id = iq.id)
  LEFT JOIN rubric_items_agg AS ri ON ri.instance_question_id = iq.id
WHERE
  ai.assessment_id = $assessment_id
  AND iq.assessment_question_id = $assessment_question_id
  AND iq.status != 'unanswered'
ORDER BY
  iq_stable_order,
  iq.id;

-- BLOCK update_instance_questions
UPDATE instance_questions AS iq
SET
  requires_manual_grading = CASE
    WHEN $update_requires_manual_grading THEN $requires_manual_grading
    ELSE requires_manual_grading
  END,
  assigned_grader = CASE
    WHEN $update_assigned_grader THEN $assigned_grader
    ELSE assigned_grader
  END
WHERE
  iq.assessment_question_id = $assessment_question_id
  AND iq.id = ANY ($instance_question_ids::bigint[]);
