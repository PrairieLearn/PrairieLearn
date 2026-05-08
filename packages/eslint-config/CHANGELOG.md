# @prairielearn/eslint-config

## 3.0.0

### Major Changes

- 4a01211: Bump `typescript` peer dependency to `^6.0.0`.

### Minor Changes

- f83d484: Add `require-trpc-permission-middleware` rule that flags any `t.procedure` chain missing a permission middleware (`requireCoursePermission*`, `requireCourseInstancePermission*`, or `requireAdministrator`). The rule is wired up automatically for files under `**/src/trpc/**/*.ts`.

### Patch Changes

- 382dbd8: Bump dependencies
- Updated dependencies [382dbd8]
- Updated dependencies [f83d484]
  - @prairielearn/eslint-plugin@4.2.0

## 2.1.0

### Minor Changes

- 18391d4: Add rule for noreferrer in target=\_blank links
- 240b216: Enable the new `@prairielearn/no-hydrate-reslocals` rule as an error.

### Patch Changes

- 393a0ba: Use modern lodash rule config
- 07dfbca: Disable `checkFromLast` in `unicorn/prefer-array-find` rule since `findLast` is unavailable in our target lib
- b6e03e9: Upgrade dependencies
- 6612675: update dependencies
- Updated dependencies [240b216]
- Updated dependencies [aaeb317]
- Updated dependencies [b6e03e9]
  - @prairielearn/eslint-plugin@4.1.0

## 2.0.1

### Patch Changes

- 144cd19: Upgrade all JavaScript dependencies

## 2.0.0

### Major Changes

- 3c4799a: Upgrade to ESLint v10

### Patch Changes

- 3c4799a: Upgrade all JavaScript dependencies
- 3c4799a: Disable the radix rule
- Updated dependencies [3c4799a]
- Updated dependencies [3c4799a]
  - @prairielearn/eslint-plugin@4.0.0

## 1.1.0

### Minor Changes

- a3ba8a0: Add `max-params` rule with a maximum of 6 parameters per function

### Patch Changes

- 7b937fb: Remove unused exports, add `@knipignore` for intentionally public exports, and re-export newly used symbols from `@prairielearn/formatter`.
- Updated dependencies [7b937fb]
  - @prairielearn/eslint-plugin@3.1.1
