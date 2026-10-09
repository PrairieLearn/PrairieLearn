-- BLOCK insert_workspace
INSERT INTO
  workspaces (state, launch_uuid, hostname)
VALUES
  ($state, $launch_uuid, 'localhost:1')
RETURNING
  *;
