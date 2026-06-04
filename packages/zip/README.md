# @prairielearn/zip

Utilities for extracting zip archives with limits that make zip bomb failures explicit and reusable across PrairieLearn.

## `extractZipArchive`

`extractZipArchive` extracts an archive to a destination directory and can enforce a maximum entry count, a maximum declared expanded size, and symbolic link rejection.

```ts
import { ZipArchiveValidationError, extractZipArchive } from '@prairielearn/zip';

try {
  await extractZipArchive({
    archivePath: '/tmp/upload.zip',
    destinationDir: '/tmp/extracted',
    maxEntries: 10_000,
    maxExtractedBytes: 500 * 1024 * 1024,
  });
} catch (err) {
  if (err instanceof ZipArchiveValidationError) {
    // Use err.code and err.details for user-facing messages.
  }
  throw err;
}
```

The expanded-size check uses each zip entry's declared `uncompressedSize` before extraction. `yauzl` validates stream sizes while entries are read, so archives whose metadata lies about the actual decompressed size fail as corrupt archives during extraction.
