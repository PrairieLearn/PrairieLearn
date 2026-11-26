-- BLOCK insert_grace_save
INSERT INTO
  assessment_instance_grace_saves (
    id,
    assessment_instance_id,
    variant_id,
    user_id,
    expires_at,
    deadline,
    credit,
    mode
  )
VALUES
  (
    $id,
    $assessment_instance_id,
    $variant_id,
    $user_id,
    $expires_at,
    $deadline,
    $credit,
    $mode
  )
RETURNING
  *;

-- BLOCK select_optional_grace_save
SELECT
  *
FROM
  assessment_instance_grace_saves
WHERE
  id = $id;

-- BLOCK delete_grace_save
DELETE FROM assessment_instance_grace_saves
WHERE
  id = $id;

-- BLOCK has_active_grace_saves
SELECT
  EXISTS (
    SELECT
      1
    FROM
      assessment_instance_grace_saves
    WHERE
      assessment_instance_id = $assessment_instance_id
      AND expires_at > $now
  );

-- BLOCK delete_expired_grace_saves
DELETE FROM assessment_instance_grace_saves
WHERE
  expires_at <= $now
  AND (
    $assessment_instance_id::bigint IS NULL
    OR assessment_instance_id = $assessment_instance_id
  );
