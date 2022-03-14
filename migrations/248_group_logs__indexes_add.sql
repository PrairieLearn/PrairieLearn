-- Optimizes for "find all logs for a certain user in a certain group"
-- queries that's used for things like generating the log of all assessment events.
CREATE INDEX group_logs_group_id_user_id_idx ON group_logs (group_id, user_id);

-- Optimizes for "find all logs for a certain user" queries.
CREATE INDEX group_logs_user_id_idx ON group_logs (user_id);
