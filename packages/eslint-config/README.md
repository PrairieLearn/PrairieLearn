# @prairielearn/eslint-config

Shared ESLint configuration for PrairieLearn projects.

## Installation

```bash
npm install @prairielearn/eslint-config
# or
yarn add @prairielearn/eslint-config
```

## Usage

Create an `eslint.config.mjs` file in your project root:

```js
import { prairielearn } from '@prairielearn/eslint-config';

export default [
  ...prairielearn({
    tsconfigRootDir: import.meta.dirname,
  }),
  // Add your project-specific rules here
];
```

## Options

| Option                | Type       | Default                                               | Description                                             |
| --------------------- | ---------- | ----------------------------------------------------- | ------------------------------------------------------- |
| `tsconfigRootDir`     | `string`   | _required_                                            | Root directory for TypeScript project service           |
| `typeAwareFiles`      | `string[]` | `['**/*.{ts,tsx}']`                                   | Glob patterns for files to apply type-aware rules to    |
| `allowDefaultProject` | `string[]` | `['*.config.ts', '*.config.mts', 'vitest.config.ts']` | Files to allow in defaultProject for type-aware linting |
| `prairielearn`        | `boolean`  | `true`                                                | Enable `@prairielearn/eslint-plugin` rules              |
| `prairieLearnOptions` | `object`   | `{}`                                                  | Options for `@prairielearn/eslint-plugin` (see below)   |
| `ignores`             | `string[]` | `[]`                                                  | Additional global ignores                               |
| `disable`             | `object`   | `{}`                                                  | Disable specific config modules                         |

### Disabling Config Modules

You can disable specific config modules:

```js
...prairielearn({
  tsconfigRootDir: import.meta.dirname,
  disable: {
    react: true,      // Disable React/hooks/accessibility rules
    vitest: true,     // Disable Vitest test rules
    perfectionist: true, // Disable sorting rules
    unicorn: true,    // Disable Unicorn rules
    jsdoc: true,      // Disable JSDoc rules
    tanstack: true,   // Disable TanStack Query rules
    lodash: true,     // Disable lodash replacement rules
  },
});
```

### PrairieLearn Plugin Options

The `prairieLearnOptions` object accepts:

| Option         | Type       | Default | Description                                     |
| -------------- | ---------- | ------- | ----------------------------------------------- |
| `allowDbTypes` | `string[]` | `[]`    | Type names to allow in the `safe-db-types` rule |

Example:

```js
...prairielearn({
  tsconfigRootDir: import.meta.dirname,
  prairieLearnOptions: {
    allowDbTypes: ['SprocUsersGetDisplayedRoleSchema'],
  },
});
```

## Included Plugins

This config includes rules from:

- `@typescript-eslint` - TypeScript-specific rules
- `@eslint-react` - React best practices
- `react-hooks` - React Hooks rules
- `jsx-a11y-x` - Accessibility rules
- `import-x` - Import ordering
- `perfectionist` - Code sorting
- `unicorn` - JavaScript best practices
- `vitest` - Test framework rules
- `jsdoc` - Documentation rules
- `@stylistic` - Code style rules
- `@tanstack/query` - React Query rules
- `@prairielearn/eslint-plugin` - PrairieLearn-specific rules

## Advanced Usage

For advanced customization, you can import individual config functions. Note that type-aware linting requires the `tsconfigRootDir` option which is only configured by the main `prairielearn()` function:

```js
import {
  baseConfig,
  typescriptConfig,
  reactConfig,
  importsConfig,
  // ... etc
} from '@prairielearn/eslint-config';

export default [
  ...baseConfig(),
  ...typescriptConfig(),
  // Mix and match as needed
];
```
