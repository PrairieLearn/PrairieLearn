-- Mirror of the PrairieTest-owned column so PrairieLearn-only environments
-- (dev, tests) have the column available. Idempotent in case PrairieTest's
-- migration has already added it against the shared database.
ALTER TABLE pt_sessions
ADD COLUMN IF NOT EXISTS lockdown_browser_enabled boolean;
