import type { TSESLint } from '@typescript-eslint/utils';
import eslintPluginUnicorn from 'eslint-plugin-unicorn';

/**
 * Unicorn plugin rules with PrairieLearn-specific overrides.
 */
export function unicornConfig(): TSESLint.FlatConfig.ConfigArray {
  return [
    {
      plugins: {
        unicorn: eslintPluginUnicorn,
      },

      rules: {
        ...eslintPluginUnicorn.configs.recommended.rules,

        // These rules don't align with our own style guidelines
        'unicorn/filename-case': 'off', // We don't enforce specific styles for filenames
        'unicorn/no-anonymous-default-export': 'off', // We use this for all of our pages
        'unicorn/no-array-callback-reference': 'off',
        'unicorn/no-array-method-this-argument': 'off',
        'unicorn/no-array-reduce': 'off', // Sometimes, an array reduce is more readable
        'unicorn/no-array-reverse': 'off', // `Array.prototype.toReversed` is not yet supported by our TypeScript config
        'unicorn/no-array-sort': 'off', // Disabling for the time being to avoid unnecessary diffs
        'unicorn/no-hex-escape': 'off',
        'unicorn/no-lonely-if': 'off', // https://github.com/PrairieLearn/PrairieLearn/pull/12546#discussion_r2252261293
        'unicorn/no-null': 'off',
        'unicorn/no-useless-undefined': 'off', // Explicit undefined is more readable than implicit undefined
        'unicorn/prefer-code-point': 'off',
        'unicorn/prefer-dom-node-dataset': 'off', // https://github.com/PrairieLearn/PrairieLearn/pull/12546#discussion_r2261095992
        'unicorn/prefer-export-from': 'off', // https://github.com/PrairieLearn/PrairieLearn/pull/12546#discussion_r2252265000
        'unicorn/prefer-string-raw': 'off', // We don't use `String.raw` in our codebase
        'unicorn/prefer-ternary': 'off', // if/else can be more readable than a ternary
        'unicorn/prefer-top-level-await': 'off', // we use this on a lot of pages
        'unicorn/prefer-type-error': 'off',
        'unicorn/prevent-abbreviations': 'off',

        // These rules have many violations. Decisions about enabling the rules have been deferred.
        'unicorn/catch-error-name': 'off', // 200+ violations
        'unicorn/no-array-for-each': 'off', // 300+ violations
        'unicorn/no-await-expression-member': 'off', // 400+ violations
        'unicorn/no-negated-condition': 'off', // 150+ violations
        'unicorn/prefer-global-this': 'off', // 150+ violations
        'unicorn/prefer-node-protocol': 'off', // 100+ violations
        'unicorn/switch-case-braces': 'off', // 200+ violations

        // TODO: investigate, < 100 violations
        'unicorn/consistent-assert': 'off',
        'unicorn/consistent-function-scoping': 'off',
        'unicorn/escape-case': 'off',
        'unicorn/import-style': 'off',
        'unicorn/numeric-separators-style': 'off',
        'unicorn/prefer-query-selector': 'off',
        'unicorn/prefer-spread': 'off',
        'unicorn/prefer-switch': 'off',
        'unicorn/text-encoding-identifier-case': 'off',

        // TODO: investigated and manual fixes are required
        'unicorn/no-object-as-default-parameter': 'off',
        'unicorn/prefer-add-event-listener': 'off',
        'unicorn/prefer-dom-node-text-content': 'off',
        'unicorn/prefer-event-target': 'off',

        // False positives
        'unicorn/error-message': 'off',
        'unicorn/prefer-at': 'off', // https://github.com/microsoft/TypeScript/issues/47660#issuecomment-3146907649
        'unicorn/throw-new-error': 'off',

        // Duplicated from other lint rules
        'unicorn/no-static-only-class': 'off',
        'unicorn/no-this-assignment': 'off',
        'unicorn/prefer-module': 'off',

        // https://github.com/PrairieLearn/PrairieLearn/pull/12545/files#r2252069292
        'unicorn/no-for-loop': 'off',

        // Conflicts with prettier
        'unicorn/no-nested-ternary': 'off',
        'unicorn/number-literal-case': 'off',
        'unicorn/template-indent': 'off',
      },
    },
  ];
}
