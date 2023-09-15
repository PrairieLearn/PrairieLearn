CREATE INDEX IF NOT EXISTS reservations_user_id_access_start_not_checked_in_idx ON reservations (user_id, access_start)
WHERE
  checked_in IS NOT NULL;
