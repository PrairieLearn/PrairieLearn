# @prairielearn/html

## 3.1.6

### Patch Changes

- 207602a: Upgrade all JavaScript dependencies

## 3.1.5

### Patch Changes

- 3395c25: Upgrade all JavaScript dependencies

## 3.1.4

### Patch Changes

- dce0fa3: Upgrade all JavaScript dependencies

## 3.1.3

### Patch Changes

- abfd5cc: Upgrade all JavaScript dependencies

## 3.1.2

### Patch Changes

- 2da23ab: Upgrade all JavaScript dependencies

## 3.1.1

### Patch Changes

- 1523b97b0: Upgrade all dependencies

## 3.1.0

### Minor Changes

- 3cd0f83fa: Add `joinHtml` function to join an array of HTML values with a given separator

## 3.0.9

### Patch Changes

- 8dd894623: Upgrade all dependencies

## 3.0.8

### Patch Changes

- bd0053577: Upgrade all dependencies

## 3.0.7

### Patch Changes

- f03853d90: Upgrade all dependencies

## 3.0.6

### Patch Changes

- 6cad75197: Upgrade all dependencies

## 3.0.5

### Patch Changes

- 10cc07dcc: Upgrade all dependencies

## 3.0.4

### Patch Changes

- 098f581da: Upgrade all dependencies

## 3.0.3

### Patch Changes

- 2b003b4d9: Upgrade all dependencies

## 3.0.2

### Patch Changes

- 2c5504f1f: Mark package as free from side effects

## 3.0.1

### Patch Changes

- 8fd47d928: Upgrade all dependencies

## 3.0.0

### Major Changes

- 638d27585: Render booleans in templates

## 2.2.0

### Minor Changes

- 915320e1f: Support interpolating BigInt values

## 2.1.1

### Patch Changes

- dba390399: Upgrade dependencies to latest versions

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
