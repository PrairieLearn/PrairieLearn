# @prairielearn/html

## 2.1.0

### Minor Changes

- c23684a26: Type constraints for interpolated values

## 2.0.0

### Major Changes

- 56f1333fc: `renderEjs` function moved to `@prairielearn/html-ejs`

  In order to be able to use the `@prairielearn/html` package inside client scripts, EJS functionality was moved to a separate package (`@prairielearn/html-ejs`). The `ejs` package relies on Node-only packages like `fs` and `path`, which renders it unusable in browsers.

## 1.0.2

### Patch Changes

- d3ed76de3: Change transpiled code to use ES2020 syntax

## 1.0.1

### Patch Changes

- 5752fab5b: Fix rendering of null values in templates
