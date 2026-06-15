ALTER TABLE reservations
ADD COLUMN IF NOT EXISTS checked_in timestamp with time zone;
