ALTER TABLE variants
-- squawk-ignore adding-foreign-key-constraint
ADD COLUMN broken_by BIGINT REFERENCES users (user_id);
