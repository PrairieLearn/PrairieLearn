# @prairielearn/preact-cjs

## 1.1.1

### Patch Changes

- 23adb05: Upgrade all JavaScript dependencies

## 1.1.0

### Minor Changes

- 5cbfc28: For each VNode, the className property is now automatically set to the class property's value, if available. This enables React-based libraries incompatible with the class prop, particularly react-bootstrap, to receive and apply CSS classes from `class`.

## 1.0.2

### Patch Changes

- 6e2ba4f: Export `preact/debug` and `preact/devtools`

## 1.0.1

### Patch Changes

- 2d9e702: Use explicit re-exports for `preact/hooks`, `preact/jsx-runtime`, and `preact/compat` to fix ESM compatibility
