-- This should be deployed during downtime.

ALTER TABLE users RENAME COLUMN user_id TO id;
