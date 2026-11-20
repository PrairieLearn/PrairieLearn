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
