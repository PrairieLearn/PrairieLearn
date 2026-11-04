import type { OxfmtConfig } from 'oxfmt';

/**
 * PrairieLearn's shared oxfmt config. oxfmt has no `extends`, so spread it into
 * `oxfmt.config.ts`:
 *
 * ```ts
 * import { defineConfig } from 'oxfmt';
 * import { oxfmtConfig } from '@prairielearn/oxc-config';
 *
 * export default defineConfig({ ...oxfmtConfig, ignorePatterns: ['public/build/**'] });
 * ```
 */
export const oxfmtConfig = {
  singleQuote: true,
  printWidth: 100,
  sortImports: {
    groups: ['side_effect', 'builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
    internalPattern: ['@prairielearn/'],
    newlinesBetween: true,
    ignoreCase: false,
    partitionByComment: true,
  },
  overrides: [
    {
      files: ['*.jsonc'],
      options: {
        trailingComma: 'none',
      },
    },
  ],
} satisfies OxfmtConfig;
