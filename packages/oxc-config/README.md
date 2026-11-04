# @prairielearn/oxc-config

Shared [oxlint](https://oxc.rs/docs/guide/usage/linter) and [oxfmt](https://oxc.rs/docs/guide/usage/formatter) configuration for PrairieLearn projects.

## Installation

```bash
pnpm add -D @prairielearn/oxc-config oxlint oxlint-tsgolint oxfmt
```

The JS plugins used by the oxlint config are dependencies of this package, so projects don't need to install them.

## oxlint

Create an `oxlint.config.mts` file in your project root:

```ts
import { defineConfig } from 'oxlint';

import { oxlintConfig } from '@prairielearn/oxc-config';

export default defineConfig({
  extends: [
    oxlintConfig({
      strictTypeAwareFiles: ['src/**/*.{ts,tsx}'],
      playwrightFiles: ['playwright/**/*'],
    }),
  ],
  overrides: [
    // Project-specific overrides.
  ],
});
```

| Option                 | Type                      | Default | Description                                                                       |
| ---------------------- | ------------------------- | ------- | --------------------------------------------------------------------------------- |
| `strictTypeAwareFiles` | `string[]`                | `[]`    | Files that get the stricter type-aware rules, such as `no-unnecessary-condition`  |
| `playwrightFiles`      | `string[]`                | `[]`    | Playwright test files, where `react/rules-of-hooks` misfires on fixtures' `use()` |
| `restrictedSyntax`     | `RestrictedSyntaxEntry[]` | `[]`    | Project-specific `no-restricted-syntax` entries, added to the shared ones         |

The shared `no-restricted-syntax` entries are exported as `restrictedSyntax` and `typescriptRestrictedSyntax`, so an override that sets `eslint-js/no-restricted-syntax` for specific files can include them.

Overrides always apply after top-level `rules`, including overrides from the shared config. To turn off a rule that the shared config enables in an override (for example, one of the `strictTypeAwareFiles` rules), turn it off in an override of your own rather than in top-level `rules`.

## oxfmt

oxfmt doesn't support `extends`, so spread the shared config into `oxfmt.config.mts`:

```ts
import { defineConfig } from 'oxfmt';

import { oxfmtConfig } from '@prairielearn/oxc-config';

export default defineConfig({ ...oxfmtConfig });
```
