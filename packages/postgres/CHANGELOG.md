# @prairielearn/postgres

## 5.0.3

### Patch Changes

- 7b937fb: Remove unused exports, add `@knipignore` for intentionally public exports, and re-export newly used symbols from `@prairielearn/formatter`.

## 5.0.2

### Patch Changes

- 8bdf6ea: Upgrade all JavaScript dependencies

## 5.0.1

### Patch Changes

- f929a68: Replace lodash with es-toolkit

## 5.0.0

### Major Changes

- 3914bb4: Upgrade to Node 24

## 4.5.2

### Patch Changes

- 0900843: Switch to the `tsgo` compiler

## 4.5.1

### Patch Changes

- 70a8029: Upgrade all JavaScript dependencies

## 4.5.0

### Minor Changes

- 3a09ac8: Update function name for test utils
- 3a09ac8: Return user/database/host from `createDatabase` in test utils

## 4.4.3

### Patch Changes

- 0425922: Upgrade all JavaScript dependencies

## 4.4.2

### Patch Changes

- c0b1c74: Enable `declarationMap`

## 4.4.1

### Patch Changes

- c72a4b8: Upgrade dependencies

## 4.4.0

### Minor Changes

- eb90b96: Add a `clearSchemasStartingWith` function

## 4.3.0

### Minor Changes

- 4bb97ac: Throw an error when the database pool gets reinitialized

## 4.2.0

### Minor Changes

- c6f661c: Make parameters optional, support single-columns schema for queryCursor

## 4.1.1

### Patch Changes

- f571b40: Upgrade all JavaScript dependencies

## 4.1.0

### Minor Changes

- 56a813a: Add `execute` and `executeRow` helpers that don't return the actual values from a query.

## 4.0.1

### Patch Changes

- b55261c: Upgrade to TypeScript 5.9

## 4.0.0

### Major Changes

- cd5ed49: `queryCursor` was removed, and now requires a Zod schema. `queryValidatedCursor` was renamed to `queryCursor`.
- 2c19e43: - Remove callback-based query functions.
  - Deprecate query functions with Zod-validated alternatives.

### Patch Changes

- 23adb05: Upgrade all JavaScript dependencies

## 3.0.0

### Major Changes

- b911b61: Remove deprecated validated query/call functions.

  Users should replace `queryValidated*` (except for `queryValidatedCursor`) and `callValidated*` with the equivalent `query*` and `call*`, respectively. For queries returning multiple columns, these calls would be equivalent. For queries returning a single column, the schema needs to be updated to the column schema.

## 2.1.15

### Patch Changes

- 678b48a: Upgrade all JavaScript dependencies

## 2.1.14

### Patch Changes

- d97b97a: Upgrade all JavaScript dependencies

## 2.1.13

### Patch Changes

- be4444e: Upgrade all JavaScript dependencies

## 2.1.12

### Patch Changes

- cec09b5: Upgrade all JavaScript dependencies

## 2.1.11

### Patch Changes

- 82f9c2f: Upgrade all JavaScript dependencies

## 2.1.10

### Patch Changes

- c24120e: Minor changes to reduce dependency on lodash
- 03f1008: Upgrade all JavaScript dependencies

## 2.1.9

### Patch Changes

- 984dc62: Upgrade all JavaScript dependencies

## 2.1.8

### Patch Changes

- 49bb3fa: Upgrade all JavaScript dependencies

## 2.1.7

### Patch Changes

- 4a8b376: Upgrade all JavaScript dependencies

## 2.1.6

### Patch Changes

- 9d7d790: Upgrade all JavaScript dependencies

## 2.1.5

### Patch Changes

- 315d931: Upgrade all JavaScript dependencies

## 2.1.4

### Patch Changes

- 4b79275: Upgrade all JavaScript dependencies

## 2.1.3

### Patch Changes

- 852c2e2: Upgrade all JavaScript dependencies

## 2.1.2

### Patch Changes

- a8438ff: Upgrade all JavaScript dependencies

## 2.1.1

### Patch Changes

- 24a93b8: Upgrade all JavaScript dependencies

## 2.1.0

### Minor Changes

- 1de33d9: Add `formatQueryWithErrorPosition` function

## 2.0.3

### Patch Changes

- 0f7c90f: Upgrade all JavaScript dependencies

## 2.0.2

### Patch Changes

- fd8f6e6: Use processed SQL when throwing errors with a `position` property

## 2.0.1

### Patch Changes

- 901fce8: Upgrade all JavaScript dependencies

## 2.0.0

### Major Changes

- 4f30b7e: Publish as native ESM

## 1.9.4

### Patch Changes

- c7e6553: Upgrade all JavaScript dependencies

## 1.9.3

### Patch Changes

- 207602a: Upgrade all JavaScript dependencies

## 1.9.2

### Patch Changes

- 3395c25: Upgrade all JavaScript dependencies

## 1.9.1

### Patch Changes

- dce0fa3: Upgrade all JavaScript dependencies

## 1.9.0

### Minor Changes

- 3249e13: Add functions for validating sproc calls

### Patch Changes

- abfd5cc: Upgrade all JavaScript dependencies

## 1.8.1

### Patch Changes

- 2da23ab: Upgrade all JavaScript dependencies

## 1.8.0

### Minor Changes

- 3d1c40c16: Export CursorIterator and QueryParams types

## 1.7.9

### Patch Changes

- 1523b97b0: Upgrade all dependencies

## 1.7.8

### Patch Changes

- 8dd894623: Upgrade all dependencies

## 1.7.7

### Patch Changes

- bd0053577: Upgrade all dependencies

## 1.7.6

### Patch Changes

- f03853d90: Upgrade all dependencies

## 1.7.5

### Patch Changes

- 6cad75197: Upgrade all dependencies

## 1.7.4

### Patch Changes

- 10cc07dcc: Upgrade all dependencies

## 1.7.3

### Patch Changes

- 098f581da: Upgrade all dependencies

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
