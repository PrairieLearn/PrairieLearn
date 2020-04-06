-- BLOCK insert_query_run
INSERT INTO query_runs
    ( name,  sql,  params,  error,  result,  authn_user_id)
VALUES
    ($name, $sql, $params, $error, $result, $authn_user_id)
RETURNING id;

-- BLOCK select_query_run
SELECT
    *,
    format_date_full_compact(date, config_select('display_timezone')) as formatted_date
FROM query_runs
WHERE id = $query_run_id;
