# Database migrations

## Overview

The PrairieLearn database is built with a series of consecutive "migrations". A migration is a modification to table schema and is represented as a file in this `migrations/` directory. Each migration is uniquely identified and ordered by a timestamp in the filename of the form `YYYYMMDDHHMMSS`. This timestamp must be unique.

The database has a special `migrations` table that tracks with migrations have already been applied. This ensures that migrations are always applied exactly once.

The current state of the DB schema is stored in a human-readable form in the `database/` directory. This is checked automatically by the unit tests and needs to be manually updated after migrations (with `make update-database-description`) and the updates should be committed to git along with the migrations.

We aim for zero-downtime deploys, so we need to think carefully about sequencing, existing table size, and so on to ensure that migrations are safe to run against a live database. Running `make lint-sql-migrations` will help check for common mistakes, such as holding exclusive locks on tables.

## Creating a migration

Each migration should have a filename of the form `{TIMESTAMP}_{DESCRIPTION}.sql`, where timestamp has the form `YYYYMMDDHHMMSS`. Such a timestamp can be generated with the following command:

```sh
node -e "console.log(new Date().toISOString().replace(/\D/g,'').slice(0,14))"
```

`{DESCRIPTION}` can take any value, but it should describe what the migration is doing. There are a few established conventions:

- `{TABLE}__{COLUMN}__{OPERATION}`: suitable for migrations involving a single column of a single table
- `{TABLE}__{OPERATION}`: suitable for migrations involving a table as a whole

Each migration file should contain one or more SQL statements to make the appropriate modifications to the database. It's fine to put multiple logically-related migration statements in the same file. Some potentially useful migration statements follow:

```sql
-- add a column to a table with a default value
ALTER TABLE assessments
ADD COLUMN auto_close boolean DEFAULT true;

-- add a column to a table
ALTER TABLE variants
ADD COLUMN authn_user_id bigint;

-- add a foreign key to a table
ALTER TABLE variants
ADD FOREIGN KEY (authn_user_id) REFERENCES users ON DELETE CASCADE ON UPDATE CASCADE;

-- remove a constraint
ALTER TABLE alternative_groups
DROP CONSTRAINT alternative_groups_number_assessment_id_key;

-- add a constraint
ALTER TABLE alternative_groups
ADD UNIQUE (assessment_id, number);
```

## Sample migration patterns

This is a collection of how to sequence some common migrations. Bullet points are ordered in sequential time order -- e.g. the first bullet point should have a timestamp before the second bullet point.

**General note:** When validating constraints on multiple tables/columns, always use a **separate migration for each validation**. `VALIDATE CONSTRAINT` and `ALTER COLUMN ... SET NOT NULL` take `ACCESS EXCLUSIVE` locks, so batching them into a single transaction will hold locks on all tables simultaneously and block reads/writes for the duration.

### Add column with default value

- Use a **single migration**

### Add column with backfill and no constraints

- First PR: add the new column
- Second PR: enqueue a batched migration to backfill the column with appropriate values
- Third PR: finalize the batched migration

### Add column with backfill and constraints

- First PR: add the column without the constraints
- Second PR: enqueue a batched migration to backfill the column with appropriate values
- Third PR: finalize and add constraints
  - Finalize the batched migration
  - Add the constraint with `NOT VALID` (this allows the constraint to be added without validating existing data)
  - In a separate migration/transaction, validate the constraint (this validates all existing data against the constraint)

### Rename column with a default value, no data preservation

If you have no meaningful reads/writes to the old column, you can combine the first and second PRs into a single PR.

- First PR: Add new column
  - Add new column with default value
  - Change all writes to write to the new column and the old column

- Second PR: Remove old column
  - Update all reads to read from the new column
  - Update all code to not write the old column
  - Mark the old column in the zod schema as `z.unknown()`

- Third PR: Finalize
  - Remove the old column from the database
  - Remove the old column from the zod schema

### Rename column with a default value, preserve data

- First PR: Add new column
  - Add new column with default value
  - Change all writes to write to the new column and the old column

- Second PR: Backfill the new column
  - Enqueue a batched migration to backfill the column with appropriate values

- Third PR: Remove reads to old column
  - Finalize the batched migration
  - Update application code to not read the old column, and read the new column

- Fourth PR: Remove writes to the old column
  - Update application code to not write the old column
  - Mark the old column in the zod schema as `z.unknown()`

- Fifth PR: Fully remove the old column
  - Remove the old column from the database
  - Remove the old column from the zod schema

### Make nullable column non-nullable

- First PR: Eliminate all write paths that insert NULL
  - Update application code to avoid writing explicit NULL values (e.g. add `.default(false)` to the relevant Zod schema)

- Second PR: Backfill existing NULL values
  - Enqueue a batched migration to update all NULL rows to the desired default

- Third PR: Add `NOT NULL` constraint
  - Finalize the batched migration
  - Add `NOT NULL` constraint to the column
  - Consider dropping `DEFAULT` on the column if all writes should explicitly provide the value
  - Update the Zod schema in `db-types.ts` to remove `.nullable()`

### Drop column

If you have no meaningful reads from the old column, you can combine the first and second PRs into a single PR.

- First PR: Remove reads from the column
  - Update all code to not read from the column

- Second PR: Remove writes to the column
  - Update all code to not write to the column
  - Mark the column in the zod schema as `z.unknown()`

- Third PR: Finalize
  - Remove the column from the database
