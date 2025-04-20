# `@prairielearn/csv`

A few helpful wrappers on top of the functionality from [`csv-stringify`](https://www.npmjs.com/package/csv-stringify).

## Usage

Here's an example taking data from `@prairielearn/postgres#queryCursor()` and writing it to a file, though this should be applicable to any source and destination streams:

```ts
import { stringifyStream } from '@prairielearn/csv';
import { queryCursor } from '@prairielearn/postgres';
import { pipeline } from 'node:stream/promises';
import { createWriteStream } from 'node:fs';

const cursor = await queryCursor('SELECT id FROM workspaces;', {});
const output = createWriteStream('workspaces.csv');

const stringifier = stringifyStream({
  header: true,
  columns: [{ key: 'id', header: 'ID' }],
  // Optionally provide a function to transform each item in the stream.
  transform(record) {
    return {
      id: `workspace-${id}`,
    };
  },
});

await pipeline(cursor.stream(100), stringifier, output);
```

Note that this works best when the source stream is producing data asynchronously, such as though an async iterator. If you use a synchronous data source like `Readable.from([...])`, the conversion will still occur synchronously. If you have a large array of data in memory and want to convert it to a CSV, you can use `stringifyNonblocking`:

```ts
import { stringifyNonblocking } from '@prairielearn/csv';
import { createWriteStream } from 'node:fs';

const data = Array.from(new Array(100_000), (_, i) => ({ id: i }));
const output = createWriteStream('numbers.csv');
stringifyNonblocking(data, {
  header: true,
  columns: [{ key: 'id', header: 'ID' }],
}).pipe(output);
```

For lower-level usage, `stringify` and `Stringifier` are also re-exported from `csv-stringify`:

```ts
import { stringify, Stringifier } from '@prairielearn/csv';
```
