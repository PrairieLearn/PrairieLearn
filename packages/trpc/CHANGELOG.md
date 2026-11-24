# @prairielearn/trpc

## 1.1.0

### Minor Changes

- f6731bf: Preserve HTTP statuses on errors wrapped by tRPC in `appErrorFormatter`, reusing the Express error-response status mapping. Export `getTrpcErrorStatus` so application logging can use the same classification before formatting.

## 1.0.2

### Patch Changes

- c71261f: Upgrade all JavaScript dependencies

## 1.0.1

### Patch Changes

- 8151381: Build with the official TypeScript 7 release instead of the native preview.

## 1.0.0

### Major Changes

- 452f675: Publish shared tRPC server, client, React, and Express infrastructure.
