-- BLOCK insert_running_workspace
INSERT INTO
  workspaces (state, launch_uuid, hostname)
VALUES
  ('running', $launch_uuid, 'localhost:1')
RETURNING
  *;
