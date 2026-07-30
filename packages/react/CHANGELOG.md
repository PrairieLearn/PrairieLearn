# @prairielearn/react

## 2.1.3

### Patch Changes

- 4a0ee46: Bump dependencies

## 2.1.2

### Patch Changes

- 3f0b326: Upgrade all JavaScript dependencies

## 2.1.1

### Patch Changes

- 382dbd8: Bump dependencies

## 2.1.0

### Minor Changes

- 240b216: `<Hydrate>` now throws at render time if the child component is given a `resLocals` or `locals` prop. All props on a hydrated component are serialized and sent to the client, so passing `res.locals` would leak the entire server-side locals object. Extract the specific fields you need (e.g. via `extractPageContext`) and pass them as individual props instead.

### Patch Changes

- b6e03e9: Upgrade dependencies
- Updated dependencies [d482019]
- Updated dependencies [e80a5a5]
- Updated dependencies [b6e03e9]
  - @prairielearn/compiled-assets@4.1.3
  - @prairielearn/browser-utils@2.7.2
  - @prairielearn/error@3.0.5
  - @prairielearn/utils@3.1.3
  - @prairielearn/html@5.0.3

## 2.0.2

### Patch Changes

- 3c4799a: Upgrade all JavaScript dependencies
- Updated dependencies [3c4799a]
- Updated dependencies [373afc1]
  - @prairielearn/compiled-assets@4.1.1
  - @prairielearn/browser-utils@2.7.1
  - @prairielearn/error@3.0.3
  - @prairielearn/utils@3.1.2
  - @prairielearn/html@5.0.2

## 2.0.1

### Patch Changes

- 8bdf6ea: Upgrade all JavaScript dependencies
- Updated dependencies [8bdf6ea]
  - @prairielearn/compiled-assets@4.0.1
  - @prairielearn/browser-utils@2.6.3
  - @prairielearn/error@3.0.2
  - @prairielearn/utils@3.1.1
  - @prairielearn/html@5.0.1

## 2.0.0

### Major Changes

- 3914bb4: Upgrade to Node 24

### Patch Changes

- Updated dependencies [3914bb4]
  - @prairielearn/compiled-assets@4.0.0
  - @prairielearn/error@3.0.0
  - @prairielearn/utils@3.0.0
  - @prairielearn/html@5.0.0
  - @prairielearn/browser-utils@2.6.2

## 1.0.1

### Patch Changes

- 3f79180: Fix React hydration mismatch with `useId()` by rendering hydrated components in an isolated React tree. This ensures hooks like `useId()` generate consistent values between server and client by placing components at the "root" position on both sides.
