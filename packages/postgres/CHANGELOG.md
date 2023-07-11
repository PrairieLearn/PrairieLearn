# @prairielearn/postgres

## 1.7.2

### Patch Changes

- 2b003b4d9: Upgrade all dependencies

## 1.7.1

### Patch Changes

- 8fd47d928: Upgrade all dependencies

## 1.7.0

### Minor Changes

- 16d0068d8: Introduce improved query functions: `queryRows`, `queryRow`, and `queryOptionalRow`

## 1.6.1

### Patch Changes

- 00d1b045d: Remove unused `pg-describe`/`pg-diff` commands from `package.json`

## 1.6.0

### Minor Changes

- dbfa7a689: Allow cursor results to be consumed as a stream

## 1.5.0

### Minor Changes

- 5d0f08ecc: Don't start nested transactions in `runInTransactionAsync`

## 1.4.0

### Minor Changes

- ce16bede7: Add `queryCursor` and `queryValidatedCursor` functions

## 1.3.0

### Minor Changes

- 5ae096ba7: Add `totalCount`, `idleCount`, and `waitingCount` properties to `PostgresPool`

## 1.1.0

### Minor Changes

- 41398700a: Add query functions with Zod-powered validation
