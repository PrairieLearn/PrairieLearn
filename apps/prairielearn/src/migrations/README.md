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

### Add column with default value

- Use a **single migration**

### Add column with backfill and no constraints

- First PR: add column and backfill
  - Add the new column
  - Enqueue a batched migration to backfill the column with appropriate values
- Second PR: finalize the batched migration

### Add column with backfill and constraints

- First PR: Add column and enqueue backfill
  - Add the column without the constraints
  - Enqueue a batched migration to backfill the column with appropriate values
- Second PR: finalize and add constraints
  - Finalize the batched migration
  - Add the constraint with `NOT VALID` (this allows the constraint to be added without validating existing data)
  - In a separate transaction, validate the constraint (this validates all existing data against the constraint)
