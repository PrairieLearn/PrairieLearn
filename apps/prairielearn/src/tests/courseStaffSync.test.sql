-- BLOCK confirmation_waiting_on_current_transaction
SELECT
  EXISTS (
    SELECT
      1
    FROM
      pg_stat_activity
    WHERE
      pg_backend_pid() = ANY (pg_blocking_pids(pid))
  );
