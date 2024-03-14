# `@prairielearn/postgres`

Tools for loading and executing Postgres queries.

## Usage

Before making any queries, you must initialize the library with your connection details and an error handler:

```ts
import sqldb from '@prairielearn/postgres';

function idleErrorHandler(err: any) {
  console.error(err);
  process.exit(1);
}

await sqldb.initAsync(
  {
    user: '...',
    database: '...',
    host: '...',
    password: '...',
    max: 2,
    idleTimeoutMillis: 30000,
  },
  idleErrorHandler,
);
```

The options argument accepts any values that the [`pg.Pool`](https://node-postgres.com/apis/pool) constructor does.

### Loading queries from files

The recommended way to write queries is to store them in a `.sql` file adjacent to the file from which they'll be used. For instance, if we want to make some queries in an `index.js` file, we can put the following in `index.sql`:

```sql
-- BLOCK select_user
SELECT
  *
FROM
  users
WHERE
  id = $user_id;

-- BLOCK select_course
SELECT
  *
FROM
  courses
WHERE
  id = $course_id;
```

You can then load these queries in your JavaScript file:

```ts
import sqldb from '@prairielearn/postgres';
const sql = sqldb.loadSqlEquiv(import.meta.url);

console.log(sql.select_user);
console.log(sql.select_course);

// Or, if you're working in a CommonJS file:
const sqldb = require('@prairielearn/postgres');
const sql = sqldb.loadSqlEquiv(__filename);
```

### Making queries

Once you've loaded your SQL, you can use them to query the database:

```ts
import sqldb from '@prairielearn/postgres';
const sql = sqldb.loadSqlEquiv(import.meta.url);

const result = await sqldb.queryAsync(sql.select_user, { user_id: '1' });
console.log(result.rows);
```

The `queryAsync` function returns a [`pg.Result`](https://node-postgres.com/apis/result) object; see linked documentation for a list of additional properties that are available on that object.

There are also utility methods that can make assertions about the results:

- `queryOneRowAsync`: Throws an error if the result doesn't have exactly one row.
- `queryZeroOrOneRowAsync`: Throws an error if the result has more than one row.

### Stored procedures (sprocs)

There are also functions that make it easy to call a stored procedure with a given set of arguments. Consider a database that has the following sproc defined:

```sql
CREATE PROCEDURE insert_data (a integer, b integer) LANGUAGE SQL
BEGIN ATOMIC
INSERT INTO
  tbl
VALUES
  (a);

INSERT INTO
  tbl
VALUES
  (b);

END;
```

You can call this sproc in your JavaScript code:

```ts
await sqldb.callAsync('insert_data', [1, 2]);
```

### Zod validation

For increased safety and confidence, you can describe the shape of data you expect from the database with a [Zod](https://zod.dev/) schema. You can then provide this schema when making a query, and the data returned from the database will be parsed with that schema.

```ts
import { z } from 'zod';
import { loadSqlEquiv, queryRows, queryRow, queryOptionalRow } from '@prairielearn/postgres';

const sql = loadSqlEquiv(import.meta.url);

const User = z.object({
  name: z.string(),
  email: z.string(),
  age: z.number(),
});

// Get all users. Returns an array of objects.
const users = await queryRows(sql.select_users, User);

// Get single user. Returns a single object.
const user = await queryRow(sql.select_user, { user_id: '1' }, User);

// Get a user that may not exist. Returns `null` if the user cannot be found.
const maybeUser = await queryOptionalRow(sql.select_user, { user_id: '1' }, User);

// Call a stored procedure. Return value is equivalent to the functions above.
const users = await callRows('select_users', User);
const user = await callRow('select_user', ['1'], User);
const maybeUser = await callOptionalRow('select_user', ['1'], User);
```

These functions have some behaviors that can make them more convenient to work with:

- Passing an object or array with parameters is optional.

- If the query returns a single column, that column is validated and returned directly. For example, consider the following query:

  ```sql
  -- BLOCK select_user_names
  SELECT
    name
  FROM
    users;
  ```

  If we then use that query with `queryRows`, the returned Promise resolves to an array of strings:

  ```ts
  const userNames = await queryRows(sql.select_user_names, z.string());

  // Prints something like `["Alice", "Bob"]`.
  console.log(userNames);
  ```

There are also a number of legacy functions available, though these are discouraged in new code.

- `queryValidatedRows`
- `queryValidatedOneRow`
- `queryValidatedZeroOrOneRow`
- `queryValidatedSingleColumnRows`
- `queryValidatedSingleColumnOneRow`
- `queryValidatedSingleColumnZeroOrOneRow`
- `callValidatedRows`
- `callValidatedOneRow`
- `callValidatedZeroOrOneRow`

For details on the behavior of these functions, see the source code.

### Transactions

To use transactions, wrap your queries with the `runInTransactionAsync` function:

```ts
const { user, course } = await sqldb.runInTransactionAsync(async () => {
  const user = await sqldb.queryAsync(sql.insert_user, { name: 'Kevin Young' });
  const course = await sqldb.queryAsync(sql.insert_course, { rubric: 'CS 101' });
  return { user, course };
});
```

`runInTransaction` will start a transaction and then execute the provided function. Any nested query will use the same client and thus run inside the transaction. If the function throws an error, the transaction is rolled back; otherwise, it is committed.

### Cursors

For very large queries that don't need to fit in memory all at once, it's possible to use a cursor to read a limited number of rows at a time.

```ts
import { queryCursor } from '@prairielearn/postgres';

const cursor = await queryCursor(sql.select_all_users, {});
for await (const users of cursor.iterate(100)) {
  // `users` will have up to 100 rows in it.
  for (const user of users) {
    console.log(user);
  }
}
```

You can optionally pass a Zod schema to parse and validate each row:

```ts
import { z } from 'zod';
import { queryValidatedCursor } from '@prairielearn/postgres';

const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
});

const cursor = await queryValidatedCursor(sql.select_all_users, {}, UserSchema);
for await (const users of cursor.iterate(100)) {
  for (const user of users) {
    console.log(user);
  }
}
```

You can also use `cursor.stream(...)` to get an object stream, which can be useful for piping it somewhere else:

```ts
import { queryCursor } from '@prairielearn/postgres';

const cursor = await queryCursor(sql.select_all_users, {});
cursor.stream(100).pipe(makeStreamSomehow());
```

### Callback-style functions

For most functions that return promises, there are corresponding versions that work with Node-style callbacks:

```ts
sqldb.query(sql.select_user, (err, result) => {
  if (err) {
    console.error('Error running query', err);
  } else {
    console.log(result.rows);
  }
});
```

However, these should be avoided in new code:

- They make it more difficult to correctly handle errors
- Callback-style code tends to be more verbose and suffer from "callback hell"
