# `@prairielearn/utils`

Various shared utilities.

## Usage

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
