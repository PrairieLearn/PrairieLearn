# `@prairielearn/migrations`

This package runs two types of database migrations:

- **Regular migrations**, which run immediately and typically change the database schema (adding/removing tables, columns, indexes, etc.)
- **Batched migrations**, which run asynchronously over batches of data within a given table.

## Usage

### Regular migrations

Regular migrations can be authored as either SQL or JavaScript. They should be located within one or more directories. They are uniquely identified by a 14-character timestamp at the start of their filename.

```sql
-- migrations/20230411002409_example_migration.sql
CREATE TABLE IF NOT EXISTS examples (id BIGSERIAL PRIMARY KEY, value TEXT NOT NULL);
```

```ts
// migrations/20230411002409_example_migration.ts
module.exports = async function () {
  console.log('something useful.');
};
```

`.sql` migrations are run inside a transaction by default. If your migration cannot run inside a transaction (for instance, if it uses `CREATE INDEX CONCURRENTLY`), you can add a special annotation comment to the file:

```sql
-- prairielearn:migrations NO TRANSACTION
CREATE INDEX CONCURRENTLY ...;
```

When running without a transaction, it is recommended that the migration only consist of a single statement so that the database isn't left in an inconsistent state.

`.js`/`.ts` migrations are not automatically run inside a transaction. If transactional DDL is required, a transaction should be manually wrapped in a transaction.

### Batched migrations

Batched migrations are useful for when one needs to make changes to many rows within a table, for instance backfilling a new column from existing data. While one could technically do this with the schema migrations machinery, that has a number of disadvantages:

- Doing an update all in one go (e.g. `UPDATE table_name SET column = 'some value' WHERE column IS NULL`) has the potential to lock the table for a long time. For zero-downtime deploys, this is unacceptable.
- Schema migrations are expected to run synchronously during deploy. So even if you wrote JavaScript code to manually batch up a table to avoid locks, you'd have to babysit a long-running process.
- If errors are encountered, you'll have to figure out how to manually retry the change for the failing batches.

By using batched migrations, these problems are avoided:

- Work is done in small batches, so large numbers of rows (or even entire tables) are not locked for long periods of time.
- Work is done asynchronously in the background, so migrations that operate on very large tables won't block deploys.
- Each batch is tracked independently and failing batched can be easily retried.

#### Writing batched migrations

Batched migrations are written as an object with two functions:

- `getParameters()`: returns the minimum and maximum IDs to operate on, as well as a batch size. `min` defaults to `1` and `batchSize` defaults to `1000`. If `max === null`, that indicates that there are no rows to operate on.
- `execute(min, max)`: runs the migration on the given range of IDs, inclusive of its endpoints.

A `makeBatchedMigration()` function is available to help ensure you're writing an object with the correct shape.

```ts
// batched-migrations/20230411002409_example_migration.ts
import { makeBatchedMigration } from '@prairielearn/migrations';
import { queryOneRowAsync, queryAsync } from '@prairielearn/postgres';

export default makeBatchedMigration({
  async getParameters() {
    const result = await queryOneRowAsync('SELECT MAX(id) as max from examples;', {});
    return {
      max: result.rows[0].max,
      batchSize: 1000,
    };
  },

  async execute(min: bigint, max: bigint) {
    await queryAsync('UPDATE examples SET text = TRIM(text) WHERE id >= $min AND id <= $max', {
      min,
      max,
    });
  },
});
```

Batched migration `execute()` functions **must** be idempotent, as they may run multiple times on the same ID range in the case of retries after failure.

#### Executing batched migrations

Unlike regular migrations, batched migrations aren't automatically started. Instead, you must write a regular migration to call `enqueueBatchedMigration()` to explicitly start a given batched migration. This provides precise control over execution order.

```ts
// migrations/20230411002409_start_batched_migration__example_migration.ts
import { enqueueBatchedMigration } from '@prairielearn/migrations';

export default async function () {
  await enqueueBatchedMigration('20230411002409_example_migration');
}
```

This will queue the batched migration for execution.

You may need to ensure that a given batched migration has succeeded before running a subsequent regular migration. For instance, you might have a batched migration that copies a column from one table to another, and you want to ensure that all data has been copied before you delete the original column. You can achieve this by "finalizing" the migration with `finalizeBatchedMigration()`. This will synchronously execute any remaining batches, and will error if the migration ends up in a failed state. This gives you a chance to fix any errors and retry the failed jobs.

```ts
// migrations/20230411002409_finalize_batched_migration__example_migration.ts
import { finalizeBatchedMigration } from '@prairielearn/migrations';

export default async function () {
  await finalizeBatchedMigration('20230411002409_finalize_batched_migration__example_migration');
}
```

In most cases, you'll want to do your best to ensure that the given batched migration has finished _before_ deploying a migration that finalizes it. That way, `finalizeBatchedMigration()` will just have to assert that the migration has already successfully executed. However, finalizing a migration is still an important part of preventing data loss or inconsistencies for many migrations.

### Server setup

To execute any pending regular migrations, call `init()` early on in your application startup code. The first argument is an array of directory paths containing migration files as described above. The second argument is a project identifier, which is used to isolate multiple migration sequences from each other when two or more applications share a single database.

```ts
import { init } from '@prairielearn/migrations';

await init([path.join(__dirname, 'migrations')], 'prairielearn');
```

If you want to make use of batched migrations, you'll need to do some additional setup. Since batched migrations are typically used with regular migrations, you'll need to take care to call `init()` after `initBatchedMigrations()` but before `startBatchedMigrations()`.

```ts
import {
  init,
  initBatchedMigrations,
  startBatchedMigrations,
  stopBatchedMigrations,
} from '@prairielearn/migrations';

const runner = initBatchedMigrations({
  project: 'prairielearn',
  directories: [path.join(__dirname, 'batched-migrations')],
});
runner.on('error', (error) => {
  // Handle error, e.g. by reporting to Sentry.
});

await init([path.join(__dirname, 'migrations')], 'prairielearn');

startBatchedMigrations({
  workDurationMs: 60_000,
  sleepDurationMs: 30_000,
});
```

If you want to gracefully shut down your server, you can stop processing batched migrations and wait for any in-progress jobs to finish.

```ts
import { stopBatchedMigrations } from '@prairielearn/migrations';

await stopBatchedMigrations();
```
