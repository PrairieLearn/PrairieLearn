-- BLOCK select_or_insert_object
INSERT INTO
  shared_state_objects (course_id, name)
VALUES
  ($course_id, $name)
ON CONFLICT (course_id, name) DO UPDATE
SET
  name = EXCLUDED.name
RETURNING
  *;

-- BLOCK select_object_state
SELECT
  o.id AS object_id,
  r.data_version AS current_data_version,
  r.scope AS current_scope,
  r.properties AS current_properties,
  (
    SELECT
      MAX(data_version)
    FROM
      shared_state_object_revisions
    WHERE
      shared_state_object_id = o.id
  ) AS max_data_version
FROM
  shared_state_objects AS o
  LEFT JOIN shared_state_object_revisions AS r ON (r.id = o.current_revision_id)
WHERE
  o.id = $object_id;

-- BLOCK insert_revision
INSERT INTO
  shared_state_object_revisions (
    shared_state_object_id,
    data_version,
    scope,
    properties
  )
VALUES
  (
    $shared_state_object_id,
    $data_version,
    $scope,
    $properties
  )
RETURNING
  *;

-- BLOCK update_object_current_revision
UPDATE shared_state_objects
SET
  current_revision_id = $revision_id
WHERE
  id = $object_id;

-- BLOCK select_object_with_revision_by_name
SELECT
  o.*,
  to_jsonb(r.*) AS revision
FROM
  shared_state_objects AS o
  LEFT JOIN shared_state_object_revisions AS r ON (r.id = o.current_revision_id)
WHERE
  o.course_id = $course_id
  AND o.name = $name;
