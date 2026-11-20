-- prairielearn:migrations NO TRANSACTION
-- Fully deploy the compatible preparation writer before removing this index.
DROP INDEX CONCURRENTLY chunks_unique_values_key;
