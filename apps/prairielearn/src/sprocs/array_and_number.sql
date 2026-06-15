-- Ideally, we'd use something like `CREATE TYPE IF NOT EXISTS` here, but Postgres doesn't offer that.
-- We used to approximate this by checking `IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = ...)`.
-- However, now that we're creating sprocs and types in a local per-process schema, this would no longer work,
-- as the type would exist in `pg_type` but not necessarily in the schemas on the search path.
-- So, instead, we blindly create the type without checking if it first exists, as it should never exist since we're
-- creating it in a fresh, empty schema. If we needed to check, a good query is:
-- DO $$ BEGIN CREATE TYPE my_type AS (...); EXCEPTION WHEN duplicate_object THEN null; END $$;
-- See https://stackoverflow.com/questions/7624919/check-if-a-user-defined-type-already-exists-in-postgresql/48382296#48382296

CREATE TYPE array_and_number AS (arr DOUBLE PRECISION[], number INTEGER);
