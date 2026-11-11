-- BLOCK insert_print_export
INSERT INTO
  print_exports (
    assessment_id,
    user_id,
    authn_user_id,
    format,
    filename,
    input_key
  )
VALUES
  (
    $assessment_id,
    $user_id,
    $authn_user_id,
    $format,
    $filename,
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

-- BLOCK fail_stale_print_exports
UPDATE print_exports
SET
  status = 'failed',
  finished_at = CURRENT_TIMESTAMP,
  failure_message = 'The export did not finish within 24 hours. Try again.'
WHERE
  status = 'pending'
  AND created_at < CURRENT_TIMESTAMP - INTERVAL '24 hours';

-- BLOCK select_pending_print_exports
SELECT
  pe.id,
  ci.course_id
FROM
  print_exports AS pe
  JOIN assessments AS a ON (a.id = pe.assessment_id)
  JOIN course_instances AS ci ON (ci.id = a.course_instance_id)
WHERE
  pe.status = 'pending';

-- BLOCK claim_print_export
UPDATE print_exports
SET
  attempts = attempts + 1
WHERE
  id = $id
  AND status = 'pending'
RETURNING
  *;

-- BLOCK release_print_export
UPDATE print_exports
SET
  attempts = greatest(attempts - 1, 0)
WHERE
  id = $id
  AND status = 'pending';

-- BLOCK finish_print_export
UPDATE print_exports
SET
  status = $status,
  finished_at = CURRENT_TIMESTAMP,
  output_key = $output_key,
  size_bytes = $size_bytes,
  label = $label,
  failure_message = $failure_message
WHERE
  id = $id
  AND status = 'pending';
