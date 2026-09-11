# `@prairielearn/utils`

Various shared utilities.

## Usage

### Civil date and time helpers

The `timezone` subpath provides `parseDateTimeInTimezone()`, `getStartOfDayInTimezone()`, and `getAdjacentDates()`.

`parseDateTimeInTimezone(input, timezone, disambiguation)` accepts ISO dates (`2026-09-01`), numeric US dates (`9/1/2026`), year-first dates with slashes (`2026/09/01`), and English month names (`Sep 1, 2026`). Times can use 24-hour or AM/PM notation. Date-only inputs use midnight; `24:00` means midnight on the following day. Two-digit US years use 2000–2069 for `00`–`69` and 1970–1999 for `70`–`99`.

The supplied timezone always determines the interpretation: a trailing `Z` or numeric UTC offset is ignored, matching PostgreSQL's `timestamp without time zone` semantics. This function parses civil time, so it should not be used to parse strings representing absolute instants. The required disambiguation argument selects Temporal's `earlier`, `later`, `compatible`, or `reject` policy for DST gaps and overlaps.

`getStartOfDayInTimezone(date, timezone)` returns the first valid instant of a `Temporal.PlainDate`, including when midnight is repeated or skipped. `getAdjacentDates(dateStrings, currentDateString)` accepts ISO date strings and returns the closest strictly earlier and later dates as `previousDate` and `nextDate`, or `null` when absent.

### `extractZipArchive()`

Node-only zip extraction with entry-count, expanded-size, and symlink validation is available from the `zip` subpath.

```ts
import { ZipArchiveValidationError, extractZipArchive } from '@prairielearn/utils/zip';

try {
  await extractZipArchive({
    archivePath: '/tmp/upload.zip',
    destinationDir: '/tmp/extracted',
    maxEntries: 10_000,
    maxExtractedBytes: 500 * 1024 * 1024,
  });
} catch (err) {
  if (err instanceof ZipArchiveValidationError) {
    // Use err.code for control flow or err.message for user-facing errors.
  }
  throw err;
}
```

Callers must specify both `maxEntries` and `maxExtractedBytes`; pass `null` for either value to explicitly disable that limit.

### `withResolvers()`

A tiny utility for creating Promises with exposed `resolve` and `reject` methods, similar to [`Promise.withResolvers()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/withResolvers).

Once `Promise.withResolvers()` is widely supported in browsers, users of this package should switch to it.

```ts
import { withResolvers } from '@prairielearn/utils';

const { promise, resolve, reject } = withResolvers<number>();

setTimeout(() => resolve(42), 100);

promise.then((value) => {
  console.log(value); // 42
});
```
