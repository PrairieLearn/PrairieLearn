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
  access_tokenset = $tokenSet,
  access_token_expires_at = $expires_at
WHERE
  id = $lti13_instance_id;

-- BLOCK update_lineitem
INSERT INTO
  lti13_lineitems (
    lti13_course_instance_id,
    lineitem_id,
    lineitem,
    assessment_id
  )
VALUES
  (
    $lti13_course_instance_id,
    $lineitem_id,
    $lineitem,
    $assessment_id
  )
ON CONFLICT (
  lti13_course_instance_id,
  lineitem_id,
  assessment_id
) DO
UPDATE
SET
  lineitem = $lineitem,
  assessment_id = $assessment_id;

-- BLOCK create_lineitems_temp
CREATE TEMPORARY TABLE new_lineitems (
  lti13_course_instance_id bigint,
  lineitem_id text,
  lineitem jsonb
) ON
COMMIT
DROP;

-- BLOCK insert_lineitems_temp
INSERT INTO
  new_lineitems (lti13_course_instance_id, lineitem_id, lineitem)
VALUES
  (
    $lti13_course_instance_id,
    $lineitem_id,
    $lineitem
  );

-- BLOCK sync_lti13_lineitems
WITH
  updating AS (
    UPDATE lti13_lineitems
    SET
      lineitem = new_lineitems.lineitem
    FROM
      new_lineitems
    WHERE
      lti13_lineitems.lineitem_id = new_lineitems.lineitem_id
      AND lti13_lineitems.lti13_course_instance_id = new_lineitems.lti13_course_instance_id
      AND lti13_lineitems.lineitem != new_lineitems.lineitem -- only update if changed
    RETURNING
      *
  ),
  deleting AS (
    DELETE FROM lti13_lineitems
    WHERE
      lti13_course_instance_id = $lti13_course_instance_id
      AND lineitem_id NOT IN (
        SELECT
          lineitem_id
        FROM
          new_lineitems
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

-- BLOCK delete_lineitem_by_assessment_id
DELETE FROM lti13_lineitems
WHERE
  lti13_course_instance_id = $lti13_course_instance_id
  AND assessment_id = $assessment_id;
