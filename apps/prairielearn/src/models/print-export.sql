-- BLOCK insert_print_export
INSERT INTO
  print_exports (
    assessment_id,
    user_id,
    authn_user_id,
    format,
    filename,
    label,
    input_key
  )
VALUES
  (
    $assessment_id,
    $user_id,
    $authn_user_id,
    $format,
    $filename,
    $label,
    $input_key
  )
RETURNING
  id;

-- BLOCK select_print_export
SELECT
  *,
  created_at < CURRENT_TIMESTAMP - INTERVAL '24 hours' AS expired
FROM
  print_exports
WHERE
  id = $id
  AND assessment_id = $assessment_id
  AND authn_user_id = $authn_user_id;

-- BLOCK select_recent_print_exports_for_assessment
SELECT
  id,
  created_at,
  status,
  format,
  filename,
  label,
  size_bytes,
  failure_message
FROM
  print_exports
WHERE
  assessment_id = $assessment_id
  AND authn_user_id = $authn_user_id
  AND created_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
ORDER BY
  created_at DESC,
  id DESC
LIMIT
  10;

-- BLOCK claim_print_export
UPDATE print_exports
SET
  attempts = attempts + 1
WHERE
  id = $id
  AND status = 'pending'
RETURNING
  *;

-- BLOCK finish_print_export
UPDATE print_exports
SET
  status = $status,
  finished_at = CURRENT_TIMESTAMP,
  output_key = $output_key,
  size_bytes = $size_bytes,
  failure_message = $failure_message
WHERE
  id = $id
  AND status = 'pending';
