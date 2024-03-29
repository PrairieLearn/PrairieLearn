# @prairielearn/migrations

## 2.0.18

### Patch Changes

- Updated dependencies [9550c19]
- Updated dependencies [3f2beec]
  - @prairielearn/error@1.1.0

## 2.0.17

### Patch Changes

- 207602a: Upgrade all JavaScript dependencies
- Updated dependencies [207602a]
  - @prairielearn/named-locks@2.0.2
  - @prairielearn/postgres@1.9.3
  - @prairielearn/logger@1.0.14
  - @prairielearn/error@1.0.15

## 2.0.16

### Patch Changes

- 3395c25: Upgrade all JavaScript dependencies
- Updated dependencies [3395c25]
  - @prairielearn/named-locks@2.0.1
  - @prairielearn/postgres@1.9.2
  - @prairielearn/logger@1.0.13
  - @prairielearn/error@1.0.14

## 2.0.15

### Patch Changes

- Updated dependencies [79c74ca]
  - @prairielearn/named-locks@2.0.0

## 2.0.14

### Patch Changes

- dce0fa3: Upgrade all JavaScript dependencies
- Updated dependencies [dce0fa3]
  - @prairielearn/named-locks@1.5.11
  - @prairielearn/postgres@1.9.1
  - @prairielearn/logger@1.0.12
  - @prairielearn/error@1.0.13

## 2.0.13

### Patch Changes

- abfd5cc: Upgrade all JavaScript dependencies
- Updated dependencies [abfd5cc]
- Updated dependencies [3249e13]
  - @prairielearn/named-locks@1.5.10
  - @prairielearn/postgres@1.9.0
  - @prairielearn/logger@1.0.11
  - @prairielearn/error@1.0.12

## 2.0.12

### Patch Changes

- 2da23ab: Upgrade all JavaScript dependencies
- Updated dependencies [2da23ab]
  - @prairielearn/named-locks@1.5.9
  - @prairielearn/postgres@1.8.1
  - @prairielearn/logger@1.0.10
  - @prairielearn/error@1.0.11

## 2.0.11

### Patch Changes

- Updated dependencies [3d1c40c16]
  - @prairielearn/postgres@1.8.0
  - @prairielearn/named-locks@1.5.8

## 2.0.10

### Patch Changes

- 1523b97b0: Upgrade all dependencies
- Updated dependencies [1523b97b0]
  - @prairielearn/named-locks@1.5.7
  - @prairielearn/postgres@1.7.9
  - @prairielearn/logger@1.0.9
  - @prairielearn/error@1.0.10

## 2.0.9

### Patch Changes

- 8dd894623: Upgrade all dependencies
- Updated dependencies [8dd894623]
  - @prairielearn/named-locks@1.5.6
  - @prairielearn/postgres@1.7.8
  - @prairielearn/logger@1.0.8
  - @prairielearn/error@1.0.9

## 2.0.8

### Patch Changes

- bd0053577: Upgrade all dependencies
- Updated dependencies [bd0053577]
  - @prairielearn/named-locks@1.5.5
  - @prairielearn/postgres@1.7.7
  - @prairielearn/logger@1.0.7
  - @prairielearn/error@1.0.8

## 2.0.7

### Patch Changes

- f03853d90: Upgrade all dependencies
- Updated dependencies [f03853d90]
  - @prairielearn/named-locks@1.5.4
  - @prairielearn/postgres@1.7.6
  - @prairielearn/logger@1.0.6
  - @prairielearn/error@1.0.7

## 2.0.6

### Patch Changes

- 6cad75197: Upgrade all dependencies
- Updated dependencies [6cad75197]
  - @prairielearn/named-locks@1.5.3
  - @prairielearn/postgres@1.7.5
  - @prairielearn/logger@1.0.5
  - @prairielearn/error@1.0.6

## 2.0.5

### Patch Changes

- 10cc07dcc: Upgrade all dependencies
- Updated dependencies [10cc07dcc]
  - @prairielearn/named-locks@1.5.2
  - @prairielearn/postgres@1.7.4
  - @prairielearn/logger@1.0.4
  - @prairielearn/error@1.0.5

## 2.0.4

### Patch Changes

- 098f581da: Upgrade all dependencies
- Updated dependencies [098f581da]
  - @prairielearn/named-locks@1.5.1
  - @prairielearn/postgres@1.7.3
  - @prairielearn/logger@1.0.3
  - @prairielearn/error@1.0.4

## 2.0.3

### Patch Changes

- Updated dependencies [cdb0f2109]
  - @prairielearn/named-locks@1.5.0

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
