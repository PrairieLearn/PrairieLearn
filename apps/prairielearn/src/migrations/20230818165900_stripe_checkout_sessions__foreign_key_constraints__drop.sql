-- We're treating this as an audit table, so we never want to drop rows when a
-- referenced row is deleted.
ALTER TABLE stripe_checkout_sessions
DROP CONSTRAINT IF EXISTS stripe_checkout_sessions_agent_user_id_fkey;

ALTER TABLE stripe_checkout_sessions
DROP CONSTRAINT IF EXISTS stripe_checkout_sessions_course_instance_id_fkey;

ALTER TABLE stripe_checkout_sessions
DROP CONSTRAINT IF EXISTS stripe_checkout_sessions_subject_user_id_fkey;
