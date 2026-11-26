-- prairielearn:migrations NO TRANSACTION
-- squawk-ignore prefer-robust-stmts
CREATE INDEX CONCURRENTLY submissions_recovered_from_user_id_idx ON submissions (recovered_from_user_id)
WHERE
  recovered_from_user_id IS NOT NULL;
