ALTER TABLE variants
ADD COLUMN broken_by BIGINT REFERENCES users (user_id);
