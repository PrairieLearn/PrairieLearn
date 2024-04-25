-- Optimizes for "find all logs for a certain group" queries that are used for
-- things like the instructor assessment instance logs.
CREATE INDEX group_logs_group_id_idx ON group_logs (group_id);

-- Optimizes for "find all logs for a certain user" queries.
CREATE INDEX group_logs_user_id_idx ON group_logs (user_id);
