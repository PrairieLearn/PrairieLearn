# @prairielearn/migrations

## 2.0.2

### Patch Changes

- 2b003b4d9: Upgrade all dependencies
- Updated dependencies [2b003b4d9]
- Updated dependencies [297bbce5a]
  - @prairielearn/named-locks@1.4.0
  - @prairielearn/postgres@1.7.2
  - @prairielearn/logger@1.0.2
  - @prairielearn/error@1.0.3

## 2.0.1

### Patch Changes

- 8fd47d928: Upgrade all dependencies
- Updated dependencies [8fd47d928]
  - @prairielearn/named-locks@1.3.3
  - @prairielearn/postgres@1.7.1
  - @prairielearn/logger@1.0.1
  - @prairielearn/error@1.0.2

## 2.0.0

### Major Changes

- 765dc616e: SQL migrations are now run inside a transaction by default

  If you need to disable this behavior, you can add an annotation comment to the top of the migration file:

  ```sql
  -- prairielearn:migrations NO TRANSACTION
  CREATE INDEX CONCURRENTLY ...
  ```

  Note that migrations implemented as JavaScript are not run in transactions by default. Transactions should be manually used as appropriate.

## 1.2.2

### Patch Changes

- Updated dependencies [16d0068d8]
  - @prairielearn/postgres@1.7.0
  - @prairielearn/named-locks@1.3.2

## 1.2.1

### Patch Changes

- Updated dependencies [00d1b045d]
  - @prairielearn/postgres@1.6.1
  - @prairielearn/named-locks@1.3.1

## 1.2.0

### Minor Changes

- 4cc962358: Add support for asynchronous batched migrations

### Patch Changes

- Updated dependencies [4cc962358]
  - @prairielearn/named-locks@1.3.0

## 1.1.0

### Minor Changes

- 400a0b901: Use automatically-renewing named lock
- 751010ea3: Support JavaScript migration files

### Patch Changes

- Updated dependencies [400a0b901]
  - @prairielearn/named-locks@1.2.0
