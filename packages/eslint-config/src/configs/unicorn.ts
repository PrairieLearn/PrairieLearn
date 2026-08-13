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
        'unicorn/prefer-unicode-code-point-escapes': 'off',
        'unicorn/no-lonely-if': 'off', // https://github.com/PrairieLearn/PrairieLearn/pull/12546#discussion_r2252261293
        'unicorn/no-null': 'off',
        'unicorn/no-useless-undefined': 'off', // Explicit undefined is more readable than implicit undefined
        'unicorn/prefer-code-point': 'off',
        'unicorn/dom-node-dataset': 'off', // https://github.com/PrairieLearn/PrairieLearn/pull/12546#discussion_r2261095992
        'unicorn/prefer-export-from': 'off', // https://github.com/PrairieLearn/PrairieLearn/pull/12546#discussion_r2252265000
        'unicorn/prefer-string-raw': 'off', // We don't use `String.raw` in our codebase
        'unicorn/prefer-ternary': 'off', // if/else can be more readable than a ternary
        'unicorn/prefer-top-level-await': 'off', // we use this on a lot of pages
        'unicorn/prefer-type-error': 'off',
        'unicorn/name-replacements': 'off',

        // These rules enforce conventions that we don't want to adopt.
        'unicorn/consistent-boolean-name': 'off', // Boolean prefixes are too restrictive
        'unicorn/consistent-class-member-order': 'off', // Existing class organization is readable
        'unicorn/consistent-compound-words': 'off', // Would create unnecessary API naming churn
        'unicorn/consistent-conditional-object-spread': 'off', // Both forms are readable
        'unicorn/max-nested-calls': 'off', // An arbitrary nesting limit does not measure readability
        'unicorn/no-break-in-nested-loop': 'off', // Extracting loops into functions is often less clear
        'unicorn/no-computed-property-existence-check': 'off', // Dynamic property checks are valid
        'unicorn/no-constant-zero-expression': 'off', // Explicit zero terms can document formulas and fixtures
        'unicorn/no-declarations-before-early-exit': 'off', // Declaration placement is contextual
        'unicorn/no-global-object-property-assignment': 'off', // Browser entry points intentionally expose globals
        'unicorn/no-non-function-verb-prefix': 'off', // Verb prefixes are valid for values such as URLs and modals
        'unicorn/no-this-outside-of-class': 'off', // We use function receivers and legacy callback APIs
        'unicorn/no-top-level-assignment-in-function': 'off', // Modules intentionally maintain process state
        'unicorn/no-top-level-side-effects': 'off', // Entry points and registration modules require side effects
        'unicorn/no-unreadable-array-destructuring': 'off', // Property swaps are a readable destructuring use
        'unicorn/no-unreadable-for-of-expression': 'off', // Temporary iterable variables are not always clearer
        'unicorn/no-useless-else': 'off', // An explicit else can make control flow clearer
        'unicorn/prefer-await': 'off', // Promise chains are sometimes clearer than try/catch
        'unicorn/prefer-block-statement-over-iife': 'off', // IIFEs isolate legacy browser scripts
        'unicorn/prefer-boolean-return': 'off', // Explicit branches can be clearer
        'unicorn/prefer-continue': 'off', // Loop structure is contextual
        'unicorn/prefer-early-return': 'off', // Guard clauses are not always clearer
        'unicorn/prefer-else-if': 'off', // Separate conditions can better communicate intent
        'unicorn/prefer-https': 'off', // HTTP is valid for local and test URLs
        'unicorn/prefer-location-assign': 'off', // Assigning location.href is an established browser idiom
        'unicorn/prefer-logical-operator-over-ternary': 'off', // Ternaries can make fallback behavior explicit
        'unicorn/prefer-math-constants': 'off', // Approximate values are intentional in fixtures and examples
        'unicorn/prefer-minimal-ternary': 'off', // The transformed expression is not always easier to read
        'unicorn/prefer-number-coercion': 'off', // Number() differs from parseInt() and parseFloat()
        'unicorn/prefer-number-is-safe-integer': 'off', // This changes the accepted numeric range
        'unicorn/prefer-private-class-fields': 'off', // Underscore fields can be part of an external contract
        'unicorn/prefer-queue-microtask': 'off', // queueMicrotask() and process.nextTick() have different ordering
        'unicorn/prefer-split-limit': 'off', // Adding a limit is not clearer for most destructuring
        'unicorn/prefer-then-catch': 'off', // Both Promise rejection styles are valid
        'unicorn/single-line-block-comment-style': 'off', // Existing license and generated comments use both styles

        // These rules have many violations. Decisions about enabling the rules have been deferred.
        'unicorn/catch-error-name': 'off', // 200+ violations
        'unicorn/no-for-each': 'off', // 300+ violations
        'unicorn/no-await-expression-member': 'off', // 400+ violations
        'unicorn/no-negated-condition': 'off', // 150+ violations
        'unicorn/prefer-global-this': 'off', // 150+ violations
        'unicorn/prefer-node-protocol': 'off', // 100+ violations
        'unicorn/prefer-simple-condition-first': 'off', // 100+ violations
        'unicorn/switch-case-braces': 'off', // 200+ violations

        // These rules look valuable, but enabling them requires a focused manual migration.
        'unicorn/better-dom-traversing': 'off', // 24 violations
        'unicorn/isolated-functions': 'off', // 41 violations, including Playwright evaluation callbacks
        'unicorn/no-array-sort-for-min-max': 'off', // 1 violation; empty-array behavior needs care
        'unicorn/no-duplicate-loops': 'off', // 1 violation; requires an allocation/readability tradeoff
        'unicorn/no-return-array-push': 'off', // 17 violations
        'unicorn/no-undeclared-class-members': 'off', // 71 violations in a legacy browser class
        'unicorn/no-unsafe-string-replacement': 'off', // 15 violations; replacements need semantic review
        'unicorn/prefer-observer-apis': 'off', // 1 violation; requires an interaction behavior change
        'unicorn/prefer-scoped-selector': 'off', // 12 violations
        'unicorn/require-array-sort-compare': 'off', // 54 violations; string sorts need individual review

        // These rules can be considered in focused autofix or cleanup PRs.
        'unicorn/logical-assignment-operators': 'off', // 40 violations
        'unicorn/no-array-from-fill': 'off', // 1 violation
        'unicorn/no-negated-array-predicate': 'off', // 26 violations
        'unicorn/no-subtraction-comparison': 'off', // 1 violation
        'unicorn/no-unnecessary-boolean-comparison': 'off', // 13 violations
        'unicorn/no-unnecessary-fetch-options': 'off', // 1 violation
        'unicorn/no-unnecessary-nested-ternary': 'off', // 3 violations
        'unicorn/no-unnecessary-splice': 'off', // 5 violations
        'unicorn/no-useless-coercion': 'off', // 43 violations
        'unicorn/no-useless-concat': 'off', // 3 violations
        'unicorn/no-useless-continue': 'off', // 2 violations
        'unicorn/no-useless-template-literals': 'off', // 32 violations
        'unicorn/operator-assignment': 'off', // 10 violations
        'unicorn/prefer-add-event-listener-options': 'off', // 2 violations
        'unicorn/prefer-array-from-map': 'off', // 23 violations
        'unicorn/prefer-array-iterable-methods': 'off', // 1 violation
        'unicorn/prefer-direct-iteration': 'off', // 15 violations
        'unicorn/prefer-hoisting-branch-code': 'off', // 7 violations
        'unicorn/prefer-includes-over-repeated-comparisons': 'off', // 10 violations
        'unicorn/prefer-math-abs': 'off', // 1 violation
        'unicorn/prefer-object-iterable-methods': 'off', // 19 violations
        'unicorn/prefer-simple-sort-comparator': 'off', // 1 violation
        'unicorn/prefer-simplified-conditions': 'off', // 3 violations
        'unicorn/prefer-string-repeat': 'off', // 16 violations
        'unicorn/prefer-type-literal-last': 'off', // 1 violation
        'unicorn/prefer-unary-minus': 'off', // 2 violations
        'unicorn/prefer-url-href': 'off', // 5 violations

        // These rules require confirming browser and runtime support before enabling them.
        'unicorn/prefer-array-from-async': 'off', // 5 violations
        'unicorn/prefer-dom-node-html-methods': 'off', // 2 violations
        'unicorn/prefer-dom-node-replace-children': 'off', // 3 violations
        'unicorn/prefer-iterator-helpers': 'off', // 3 violations
        'unicorn/prefer-iterator-to-array': 'off', // 34 violations
        'unicorn/prefer-iterator-to-array-at-end': 'off', // 5 violations
        'unicorn/prefer-promise-with-resolvers': 'off', // 5 violations
        'unicorn/prefer-set-methods': 'off', // 5 violations
        'unicorn/prefer-toggle-attribute': 'off', // 2 violations

        // False positives for intentional source text or module structure.
        'unicorn/no-exports-in-scripts': 'off', // The server entry point is an ES module
        'unicorn/no-incorrect-template-string-interpolation': 'off', // We test and document literal ${...} text

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
        'unicorn/prefer-array-find': ['error', { checkFromLast: false }], // findLast is unavailable in our target lib
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
