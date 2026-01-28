import type { TSESLint } from '@typescript-eslint/utils';
import { globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

import { baseConfig } from './configs/base.js';
import { importsConfig } from './configs/imports.js';
import { jsdocConfig } from './configs/jsdoc.js';
import { lodashConfig } from './configs/lodash.js';
import { perfectionistConfig } from './configs/perfectionist.js';
import { type PrairieLearnPluginOptions, prairieLearnConfig } from './configs/prairielearn.js';
import { reactConfig } from './configs/react.js';
import { stylisticConfig } from './configs/stylistic.js';
import { tanstackConfig } from './configs/tanstack.js';
import { typescriptConfig, typescriptTypeAwareRules } from './configs/typescript.js';
import { unicornConfig } from './configs/unicorn.js';
import { vitestConfig } from './configs/vitest.js';

export interface PrairieLearnEslintConfigOptions {
  /**
   * Root directory for TypeScript project service.
   * Required for type-aware linting.
   */
  tsconfigRootDir: string;

  /**
   * Glob patterns for files to apply type-aware rules to.
   * @default ['**\/*.{ts,tsx}']
   */
  typeAwareFiles?: string[];

  /**
   * Files to allow in defaultProject for type-aware linting.
   * Useful for config files outside the main tsconfig.
   * @default ['*.config.ts', '*.config.mts', 'vitest.config.ts']
   */
  allowDefaultProject?: string[];

  /**
   * Enable `@prairielearn/eslint-plugin` rules.
   * @default true
   */
  prairielearn?: boolean;

  /**
   * Options for the `@prairielearn/eslint-plugin` rules.
   */
  prairieLearnOptions?: PrairieLearnPluginOptions;

  /**
   * Global ignores to apply.
   * Will be merged with default ignores.
   */
  ignores?: string[];

  /**
   * Disable specific config modules.
   */
  disable?: {
    react?: boolean;
    vitest?: boolean;
    perfectionist?: boolean;
    unicorn?: boolean;
    jsdoc?: boolean;
    tanstack?: boolean;
    lodash?: boolean;
  };
}

/**
 * Creates a PrairieLearn ESLint configuration array.
 *
 * @example
 * ```js
 * // eslint.config.mjs
 * import { prairielearn } from '@prairielearn/eslint-config';
 *
 * export default [
 *   ...prairielearn({
 *     tsconfigRootDir: import.meta.dirname,
 *   }),
 *   // Add your project-specific rules here
 * ];
 * ```
 */
export function prairielearn(
  options: PrairieLearnEslintConfigOptions,
): TSESLint.FlatConfig.ConfigArray {
  const {
    tsconfigRootDir,
    typeAwareFiles = ['**/*.{ts,tsx}'],
    allowDefaultProject = ['*.config.ts', '*.config.mts', 'vitest.config.ts'],
    prairielearn: enablePrairielearn = true,
    prairieLearnOptions,
    ignores = [],
    disable = {},
  } = options;

  const jsFiles = ['**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}'];

  const configs: TSESLint.FlatConfig.ConfigArray = [
    // Base typescript-eslint configs (scoped to JS/TS files)
    ...tseslint.config({
      extends: [...tseslint.configs.stylistic, ...tseslint.configs.strict],
      files: jsFiles,
    }),
    // Base configs (always included)
    ...baseConfig(),
    // TypeScript config (scoped to JS/TS files)
    {
      files: jsFiles,
      ...typescriptConfig()[0],
    },
    ...importsConfig(),
    ...stylisticConfig(),
  ];

  // Optional configs
  if (!disable.react) {
    configs.push(...reactConfig());
  }

  if (!disable.vitest) {
    configs.push(...vitestConfig());
  }

  if (!disable.perfectionist) {
    configs.push(...perfectionistConfig());
  }

  if (!disable.unicorn) {
    configs.push(...unicornConfig());
  }

  if (!disable.jsdoc) {
    configs.push(...jsdocConfig());
  }

  if (!disable.tanstack) {
    configs.push(...tanstackConfig());
  }

  if (!disable.lodash) {
    configs.push(...lodashConfig());
  }

  if (enablePrairielearn) {
    configs.push(...prairieLearnConfig(prairieLearnOptions));
  }

  // Type-aware rules (applied to specified files)
  // We use tseslint.config() to properly handle the extends syntax
  configs.push(
    ...tseslint.config({
      extends: [
        tseslint.configs.recommendedTypeCheckedOnly,
        tseslint.configs.stylisticTypeCheckedOnly,
      ],
      files: typeAwareFiles,
      languageOptions: {
        parserOptions: {
          projectService: {
            allowDefaultProject,
          },
          tsconfigRootDir,
        },
      },
      rules: typescriptTypeAwareRules(),
    }),
  );

  // Default ignores
  return [
    ...configs,
    globalIgnores(['.yarn/*', 'node_modules/*', 'dist/*', 'coverage/*', ...ignores]),
  ];
}

// Re-export individual configs for advanced use
export { baseConfig } from './configs/base.js';
export { importsConfig } from './configs/imports.js';
export { jsdocConfig } from './configs/jsdoc.js';
export { lodashConfig } from './configs/lodash.js';
export { perfectionistConfig } from './configs/perfectionist.js';
export { prairieLearnConfig, type PrairieLearnPluginOptions } from './configs/prairielearn.js';
export { reactConfig } from './configs/react.js';
export { stylisticConfig } from './configs/stylistic.js';
export { tanstackConfig } from './configs/tanstack.js';
export { typescriptConfig, typescriptTypeAwareRules } from './configs/typescript.js';
export { unicornConfig } from './configs/unicorn.js';
export { vitestConfig } from './configs/vitest.js';
