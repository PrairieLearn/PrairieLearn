# @prairielearn/react

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
