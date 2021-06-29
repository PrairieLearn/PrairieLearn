-- We do not test whether the type already exists.
-- This is because we will be creating it within the current default schema, which will be empty.
-- We could test whether the type exists in any schema by querying pg_type like in migrations/000_initial_state.sql.
-- But that would test for the type in any schema, and we only care about schema on the search path.
-- It's hard to restrict the "does this type exist" query to just the current search path.
CREATE TYPE array_and_number AS (arr DOUBLE PRECISION[], number INTEGER);
