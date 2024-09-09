-- BLOCK select_ci_validation
SELECT
  EXISTS (
    SELECT
      1
    FROM
      lti13_course_instances
    WHERE
      course_instance_id = $course_instance_id
  );

-- BLOCK update_token
UPDATE lti13_instances
SET
  access_tokenset = $access_tokenset,
  access_token_expires_at = $access_token_expires_at
WHERE
  id = $lti13_instance_id;

-- BLOCK upsert_lti13_assessment
INSERT INTO
  lti13_assessments (
    lti13_course_instance_id,
    lineitem_id_url,
    lineitem,
    assessment_id,
    last_activity
  )
VALUES
  (
    $lti13_course_instance_id,
    $lineitem_id_url,
    $lineitem,
    $assessment_id,
    NOW()
  )
ON CONFLICT (lti13_course_instance_id, lineitem_id_url) DO
UPDATE
SET
  lineitem = $lineitem,
  assessment_id = $assessment_id,
  last_activity = NOW();

-- BLOCK sync_lti13_assessments
WITH
  imported AS (
    SELECT
      *
    FROM
      jsonb_populate_recordset(null::lti13_assessments, $lineitems_import::jsonb)
  ),
  updating AS (
    UPDATE lti13_assessments
    SET
      lineitem = imported.lineitem
    FROM
      imported
    WHERE
      lti13_assessments.lineitem_id_url = imported.lineitem_id_url
      AND lti13_assessments.lti13_course_instance_id = imported.lti13_course_instance_id
      AND lti13_assessments.lineitem != imported.lineitem -- only update if changed
    RETURNING
      *
  ),
  deleting AS (
    DELETE FROM lti13_assessments
    WHERE
      lti13_course_instance_id = $lti13_course_instance_id
      AND lineitem_id_url NOT IN (
        SELECT
          lineitem_id_url
        FROM
          imported
      )
    RETURNING
      *
  )
SELECT
  (
    SELECT
      count(*)
    FROM
      updating
  ) as updated,
  (
    SELECT
      count(*)
    FROM
      deleting
  ) AS deleted;

-- BLOCK delete_lti13_assessment
DELETE FROM lti13_assessments
WHERE
  lti13_course_instance_id = $lti13_course_instance_id
  AND assessment_id = $assessment_id;

-- BLOCK select_assessment_instances_for_scores
SELECT
  ai.*,
  CASE
    WHEN a.group_work
    AND ai.group_id IS NOT NULL THEN (
      SELECT
        jsonb_agg(
          to_jsonb(users) || jsonb_build_object('lti13_sub', lti13_users.sub)
        )
      FROM
        group_users
        JOIN users ON (group_users.user_id = users.user_id)
        LEFT JOIN lti13_users ON (lti13_users.user_id = group_users.user_id)
      WHERE
        group_users.group_id = ai.group_id
    )
    ELSE jsonb_build_array(
      to_jsonb(u) || jsonb_build_object('lti13_sub', lu.sub)
    )
  END AS users
FROM
  assessment_instances AS ai
  JOIN assessments AS a ON (a.id = ai.assessment_id)
  LEFT JOIN users AS u ON (u.user_id = ai.user_id)
  LEFT JOIN lti13_users AS lu ON (lu.user_id = ai.user_id)
WHERE
  ai.assessment_id = $assessment_id
  AND ai.score_perc IS NOT NULL
  AND ai.date IS NOT NULL;

-- BLOCK upsert_lti13_users
INSERT INTO
  lti13_users (user_id, lti13_instance_id, sub)
SELECT
  user_id,
  $lti13_instance_id,
  $sub
FROM
  users
WHERE
  uid = $uid
  AND institution_id = $institution_id
ON CONFLICT (user_id, lti13_instance_id) DO
UPDATE
SET
  sub = $sub;

-- BLOCK select_assessment_with_lti13_course_instance_id
SELECT
  a.*,
  la.lineitem_id_url AS lti13_lineitem_id_url,
  lti13_course_instances.lti13_instance_id,
  lti13_course_instances.context_memberships_url
FROM
  assessments AS a
  JOIN lti13_assessments AS la ON (la.assessment_id = a.id)
  JOIN lti13_course_instances ON (
    lti13_course_instances.id = la.lti13_course_instance_id
  )
WHERE
  a.id = $assessment_id
  AND lti13_course_instances.lti13_instance_id = $lti13_instance_id
  AND a.deleted_at IS NULL;
