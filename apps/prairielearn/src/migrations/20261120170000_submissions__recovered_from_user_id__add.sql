ALTER TABLE submissions
ADD COLUMN recovered_from_user_id BIGINT;

ALTER TABLE submissions
ADD CONSTRAINT submissions_recovered_from_user_id_fkey FOREIGN KEY (recovered_from_user_id) REFERENCES users (id) ON DELETE SET NULL ON UPDATE CASCADE NOT VALID;
