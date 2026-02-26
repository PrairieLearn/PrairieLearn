-- Before/after EXPLAIN ANALYZE for select_instance_questions_manual_grading
-- to demonstrate the impact of MATERIALIZED on the CTEs.
--
-- Usage:
--   psql <prod_connection> -f scripts/before-after-manual-grading.sql 2>&1 | tee manual-grading-results.txt

SET search_path TO "i-09e17cbcdc18cf3d0:80_2026-02-24T02:23:40.262Z_O1TX5H", public;
SET default_transaction_read_only = on;

-- =============================================================================
-- BEFORE: without MATERIALIZED (current production behavior)
-- =============================================================================
\echo ''
\echo '=== BEFORE: without MATERIALIZED ==='

EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
WITH
  issue_count AS (
    SELECT
      i.instance_question_id,
      count(*)::integer AS open_issue_count
    FROM issues AS i
    WHERE
      i.assessment_id = 2626054
      AND i.course_caused
      AND i.open
    GROUP BY i.instance_question_id
  ),
  latest_submissions AS (
    SELECT DISTINCT ON (iq.id)
      iq.id AS instance_question_id,
      s.id AS submission_id,
      s.manual_rubric_grading_id
    FROM
      instance_questions AS iq
      JOIN variants AS v ON iq.id = v.instance_question_id
      JOIN submissions AS s ON v.id = s.variant_id
    WHERE
      iq.assessment_question_id = 2016037439
    ORDER BY
      iq.id ASC,
      s.date DESC
  ),
  rubric_items_agg AS (
    SELECT
      ls.instance_question_id,
      COALESCE(
        json_agg(rgi.rubric_item_id) FILTER (WHERE rgi.rubric_item_id IS NOT NULL),
        '[]'::json
      ) AS rubric_grading_item_ids
    FROM
      latest_submissions AS ls
      LEFT JOIN rubric_grading_items AS rgi ON (rgi.rubric_grading_id = ls.manual_rubric_grading_id)
    GROUP BY ls.instance_question_id
  )
SELECT
  to_jsonb(iq.*) AS instance_question,
  ai.open AS assessment_open,
  COALESCE(u.uid, array_to_string(gul.uid_list, ', ')) AS uid,
  COALESCE(agu.name, agu.uid) AS assigned_grader_name,
  COALESCE(lgu.name, lgu.uid) AS last_grader_name,
  to_jsonb(aq.*) AS assessment_question,
  COALESCE(g.name, u.name) AS user_or_group_name,
  ic.open_issue_count,
  ((iq.id % 21317) * 45989) % 3767 AS iq_stable_order,
  COALESCE(ri.rubric_grading_item_ids, '[]'::json) AS rubric_grading_item_ids,
  e.id AS enrollment_id
FROM
  instance_questions AS iq
  JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
  JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
  JOIN assessments AS a ON (a.id = ai.assessment_id)
  LEFT JOIN users AS u ON (u.id = ai.user_id)
  LEFT JOIN teams AS g ON (g.id = ai.team_id)
  LEFT JOIN teams_uid_list(g.id) AS gul ON TRUE
  LEFT JOIN enrollments AS e ON (
    e.user_id = ai.user_id AND e.course_instance_id = a.course_instance_id
  )
  LEFT JOIN users AS agu ON (agu.id = iq.assigned_grader)
  LEFT JOIN users AS lgu ON (lgu.id = iq.last_grader)
  LEFT JOIN issue_count AS ic ON (ic.instance_question_id = iq.id)
  LEFT JOIN rubric_items_agg AS ri ON ri.instance_question_id = iq.id
WHERE
  ai.assessment_id = 2626054
  AND iq.assessment_question_id = 2016037439
  AND iq.status != 'unanswered'
ORDER BY
  iq_stable_order, iq.id;


-- =============================================================================
-- AFTER: with MATERIALIZED
-- =============================================================================
\echo ''
\echo '=== AFTER: with MATERIALIZED ==='

EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
WITH
  issue_count AS (
    SELECT
      i.instance_question_id,
      count(*)::integer AS open_issue_count
    FROM issues AS i
    WHERE
      i.assessment_id = 2626054
      AND i.course_caused
      AND i.open
    GROUP BY i.instance_question_id
  ),
  latest_submissions AS MATERIALIZED (
    SELECT DISTINCT ON (iq.id)
      iq.id AS instance_question_id,
      s.id AS submission_id,
      s.manual_rubric_grading_id
    FROM
      instance_questions AS iq
      JOIN variants AS v ON iq.id = v.instance_question_id
      JOIN submissions AS s ON v.id = s.variant_id
    WHERE
      iq.assessment_question_id = 2016037439
    ORDER BY
      iq.id ASC,
      s.date DESC
  ),
  rubric_items_agg AS MATERIALIZED (
    SELECT
      ls.instance_question_id,
      COALESCE(
        json_agg(rgi.rubric_item_id) FILTER (WHERE rgi.rubric_item_id IS NOT NULL),
        '[]'::json
      ) AS rubric_grading_item_ids
    FROM
      latest_submissions AS ls
      LEFT JOIN rubric_grading_items AS rgi ON (rgi.rubric_grading_id = ls.manual_rubric_grading_id)
    GROUP BY ls.instance_question_id
  )
SELECT
  to_jsonb(iq.*) AS instance_question,
  ai.open AS assessment_open,
  COALESCE(u.uid, array_to_string(gul.uid_list, ', ')) AS uid,
  COALESCE(agu.name, agu.uid) AS assigned_grader_name,
  COALESCE(lgu.name, lgu.uid) AS last_grader_name,
  to_jsonb(aq.*) AS assessment_question,
  COALESCE(g.name, u.name) AS user_or_group_name,
  ic.open_issue_count,
  ((iq.id % 21317) * 45989) % 3767 AS iq_stable_order,
  COALESCE(ri.rubric_grading_item_ids, '[]'::json) AS rubric_grading_item_ids,
  e.id AS enrollment_id
FROM
  instance_questions AS iq
  JOIN assessment_instances AS ai ON (ai.id = iq.assessment_instance_id)
  JOIN assessment_questions AS aq ON (aq.id = iq.assessment_question_id)
  JOIN assessments AS a ON (a.id = ai.assessment_id)
  LEFT JOIN users AS u ON (u.id = ai.user_id)
  LEFT JOIN teams AS g ON (g.id = ai.team_id)
  LEFT JOIN teams_uid_list(g.id) AS gul ON TRUE
  LEFT JOIN enrollments AS e ON (
    e.user_id = ai.user_id AND e.course_instance_id = a.course_instance_id
  )
  LEFT JOIN users AS agu ON (agu.id = iq.assigned_grader)
  LEFT JOIN users AS lgu ON (lgu.id = iq.last_grader)
  LEFT JOIN issue_count AS ic ON (ic.instance_question_id = iq.id)
  LEFT JOIN rubric_items_agg AS ri ON ri.instance_question_id = iq.id
WHERE
  ai.assessment_id = 2626054
  AND iq.assessment_question_id = 2016037439
  AND iq.status != 'unanswered'
ORDER BY
  iq_stable_order, iq.id;
