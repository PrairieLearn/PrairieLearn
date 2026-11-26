-- BLOCK insert_oauth_client
INSERT INTO
  oauth_clients (client_name, redirect_uris)
VALUES
  ($client_name, $redirect_uris)
RETURNING
  *;

-- BLOCK select_oauth_client_by_client_id
SELECT
  *
FROM
  oauth_clients
WHERE
  client_id = $client_id;
