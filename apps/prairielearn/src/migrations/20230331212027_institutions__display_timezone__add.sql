ALTER TABLE institutions
ADD COLUMN IF NOT EXISTS display_timezone TEXT NOT NULL DEFAULT 'America/Chicago';
