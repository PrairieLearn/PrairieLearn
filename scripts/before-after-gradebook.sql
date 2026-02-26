-- Before/after EXPLAIN ANALYZE for user_scores (instructor gradebook)
-- Tests one change:
--   Pre-computed team_member_uids CTE (avoids correlated subquery executed ~41K times)
--
-- Usage:
--   psql <prod_connection> -f scripts/before-after-gradebook.sql 2>&1 | tee gradebook-results.txt

SET search_path TO "i-09e17cbcdc18cf3d0:80_2026-02-24T02:23:40.262Z_O1TX5H", public;

-- Look up course_id from course_instance_id
SELECT ci.course_id AS course_id_for_gradebook
FROM course_instances ci WHERE ci.id = 187195
\gset

SET default_transaction_read_only = on;


-- =============================================================================
-- BEFORE: current production query
-- =============================================================================
\echo ''
\echo '=== BEFORE: current production query ==='

EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
WITH
  course_assessment_instances AS (
    SELECT
      ai.id,
      COALESCE(ai.user_id, gu.user_id) AS user_id,
      ai.team_id,
      ai.assessment_id,
      ai.score_perc
    FROM
      assessment_instances AS ai
      JOIN assessments AS a ON (a.id = ai.assessment_id)
      LEFT JOIN teams AS g ON (g.id = ai.team_id)
      LEFT JOIN team_users AS gu ON (gu.team_id = g.id)
    WHERE
      a.course_instance_id = 187195
      AND g.deleted_at IS NULL
  ),
  course_scores AS (
    SELECT DISTINCT ON (cai.user_id, cai.assessment_id)
      cai.id AS assessment_instance_id,
      cai.user_id,
      cai.assessment_id,
      cai.score_perc,
      cai.team_id
    FROM course_assessment_instances AS cai
    ORDER BY
      cai.user_id ASC,
      cai.assessment_id ASC,
      cai.score_perc DESC,
      cai.id DESC
  ),
  user_ids AS (
    (SELECT DISTINCT user_id FROM course_scores)
    UNION
    (SELECT user_id FROM enrollments WHERE course_instance_id = 187195)
    UNION
    (SELECT user_id FROM course_permissions WHERE course_id = :course_id_for_gradebook AND course_role > 'None')
    UNION
    (
      SELECT cp.user_id
      FROM course_instance_permissions cip
      JOIN course_permissions cp ON (cp.id = cip.course_permission_id)
      WHERE cip.course_instance_id = 187195
        AND cip.course_instance_role > 'None'
    )
  ),
  course_users AS (
    SELECT
      u.id,
      u.uid,
      u.uin,
      u.name AS user_name,
      users_get_displayed_role(u.id, 187195) AS role
    FROM user_ids
    JOIN users AS u ON (u.id = user_ids.user_id)
  ),
  user_scores AS (
    SELECT
      u.id AS user_id,
      JSONB_OBJECT_AGG(
        s.assessment_id,
        json_build_object(
          'score_perc', s.score_perc,
          'assessment_instance_id', s.assessment_instance_id,
          'uid_other_users_group', COALESCE(
            (
              SELECT json_agg(
                json_build_object('uid', ou.uid, 'enrollment_id', e.id)
              )
              FROM team_users AS ogu
              LEFT JOIN course_users AS ou ON (ou.id = ogu.user_id)
              LEFT JOIN enrollments AS e ON (
                ou.id = e.user_id AND e.course_instance_id = 187195
              )
              WHERE ogu.team_id = s.team_id AND ogu.user_id != u.id
            ),
            '[]'::json
          )
        )
      ) AS scores
    FROM
      course_users AS u
      JOIN course_scores AS s ON (s.user_id = u.id)
    GROUP BY u.id
  )
SELECT
  u.id AS user_id,
  u.uid,
  u.uin,
  u.user_name,
  u.role,
  to_jsonb(e.*) AS enrollment,
  COALESCE(s.scores, '{}') AS scores
FROM
  course_users AS u
  LEFT JOIN enrollments AS e ON (
    e.user_id = u.id AND e.course_instance_id = 187195
  )
  LEFT JOIN user_scores AS s ON (u.id = s.user_id)
ORDER BY
  role DESC, uid ASC;


-- =============================================================================
-- AFTER: pre-computed team_member_uids CTE
-- =============================================================================
\echo ''
\echo '=== AFTER: pre-computed team_member_uids CTE ==='

EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
WITH
  course_assessment_instances AS (
    SELECT
      ai.id,
      COALESCE(ai.user_id, gu.user_id) AS user_id,
      ai.team_id,
      ai.assessment_id,
      ai.score_perc
    FROM
      assessment_instances AS ai
      JOIN assessments AS a ON (a.id = ai.assessment_id)
      LEFT JOIN teams AS g ON (g.id = ai.team_id)
      LEFT JOIN team_users AS gu ON (gu.team_id = g.id)
    WHERE
      a.course_instance_id = 187195
      AND g.deleted_at IS NULL
  ),
  course_scores AS (
    SELECT DISTINCT ON (cai.user_id, cai.assessment_id)
      cai.id AS assessment_instance_id,
      cai.user_id,
      cai.assessment_id,
      cai.score_perc,
      cai.team_id
    FROM course_assessment_instances AS cai
    ORDER BY
      cai.user_id ASC,
      cai.assessment_id ASC,
      cai.score_perc DESC,
      cai.id DESC
  ),
  user_ids AS (
    (SELECT DISTINCT user_id FROM course_scores)
    UNION
    (SELECT user_id FROM enrollments WHERE course_instance_id = 187195)
    UNION
    (SELECT user_id FROM course_permissions WHERE course_id = :course_id_for_gradebook AND course_role > 'None')
    UNION
    (
      SELECT cp.user_id
      FROM course_instance_permissions cip
      JOIN course_permissions cp ON (cp.id = cip.course_permission_id)
      WHERE cip.course_instance_id = 187195
        AND cip.course_instance_role > 'None'
    )
  ),
  course_users AS (
    SELECT
      u.id,
      u.uid,
      u.uin,
      u.name AS user_name,
      users_get_displayed_role(u.id, 187195) AS role
    FROM user_ids
    JOIN users AS u ON (u.id = user_ids.user_id)
  ),
  team_member_uids AS (
    SELECT
      s.assessment_instance_id,
      s.user_id,
      json_agg(
        json_build_object('uid', ou.uid, 'enrollment_id', e.id)
      ) AS uid_other_users_group
    FROM
      course_scores AS s
      JOIN team_users AS ogu ON (
        ogu.team_id = s.team_id
        AND ogu.user_id != s.user_id
      )
      JOIN course_users AS ou ON (ou.id = ogu.user_id)
      LEFT JOIN enrollments AS e ON (
        ou.id = e.user_id
        AND e.course_instance_id = 187195
      )
    WHERE
      s.team_id IS NOT NULL
    GROUP BY
      s.assessment_instance_id,
      s.user_id
  ),
  user_scores AS (
    SELECT
      u.id AS user_id,
      JSONB_OBJECT_AGG(
        s.assessment_id,
        json_build_object(
          'score_perc', s.score_perc,
          'assessment_instance_id', s.assessment_instance_id,
          'uid_other_users_group',
          COALESCE(tmu.uid_other_users_group, '[]'::json)
        )
      ) AS scores
    FROM
      course_users AS u
      JOIN course_scores AS s ON (s.user_id = u.id)
      LEFT JOIN team_member_uids AS tmu ON (
        tmu.assessment_instance_id = s.assessment_instance_id
        AND tmu.user_id = u.id
      )
    GROUP BY u.id
  )
SELECT
  u.id AS user_id,
  u.uid,
  u.uin,
  u.user_name,
  u.role,
  to_jsonb(e.*) AS enrollment,
  COALESCE(s.scores, '{}') AS scores
FROM
  course_users AS u
  LEFT JOIN enrollments AS e ON (
    e.user_id = u.id AND e.course_instance_id = 187195
  )
  LEFT JOIN user_scores AS s ON (u.id = s.user_id)
ORDER BY
  role DESC, uid ASC;
