-- BLOCK create
CREATE TABLE IF NOT EXISTS execution_receipts (
  operation_id TEXT PRIMARY KEY,
  receipt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rejected_dispatches (dispatch_id TEXT PRIMARY KEY);

-- BLOCK save_executions
INSERT
OR REPLACE INTO execution_receipts (operation_id, receipt)
SELECT
  key,
  value
FROM
  json_each(?);

-- BLOCK save_rejections
INSERT
OR IGNORE INTO rejected_dispatches (dispatch_id)
SELECT
  value
FROM
  json_each(?);

-- BLOCK executions
SELECT
  operation_id,
  receipt
FROM
  execution_receipts
WHERE
  operation_id IN (
    SELECT
      value
    FROM
      json_each(?)
  );

-- BLOCK rejected
SELECT
  dispatch_id
FROM
  rejected_dispatches
WHERE
  dispatch_id = ?;

-- BLOCK unstarted
SELECT
  operation_id,
  receipt
FROM
  execution_receipts
WHERE
  operation_id > ?
  AND json_extract (receipt, '$.authorization') IS NOT NULL
  AND COALESCE(
    json_extract (receipt, '$.authorization.authorized'),
    0
  ) = 0
ORDER BY
  operation_id
LIMIT
  100;
