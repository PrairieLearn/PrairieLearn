-- BLOCK insert_query_run
INSERT INTO query_runs
    ( name,  sql,  params,  error,  result,  authn_user_id)
VALUES
    ($name, $sql, $params, $error, $result, $authn_user_id)
RETURNING id;
