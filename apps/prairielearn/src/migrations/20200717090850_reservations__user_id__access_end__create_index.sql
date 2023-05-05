DROP INDEX IF EXISTS reservations_user_id_access_start_not_checked_in_idx;

CREATE INDEX IF NOT EXISTS reservations_user_id_access_end_idx ON reservations (user_id, access_end);
