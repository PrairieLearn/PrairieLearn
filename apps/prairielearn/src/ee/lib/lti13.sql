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
