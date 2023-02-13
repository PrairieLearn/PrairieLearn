ALTER TABLE users
ADD COLUMN IF NOT EXISTS provider text DEFAULT 'shibboleth';
