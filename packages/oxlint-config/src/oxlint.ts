import { fileURLToPath } from 'node:url';

import type { OxlintConfig } from 'oxlint';

type RuleEntry = NonNullable<OxlintConfig['rules']>[string];

export interface RestrictedSyntaxEntry {
  selector: string;
  message: string;
}

/**
 * Resolves a JS plugin from this package's own dependencies, so projects using this config don't
 * need to install every plugin themselves. Each plugin is given an explicit name because oxlint
 * can only infer a plugin's name from a package specifier, not from a resolved path.
 */
function jsPlugin(name: string, specifier: string) {
  return { name, specifier: fileURLToPath(import.meta.resolve(specifier)) };
}

/** Restricted syntax for all JavaScript and TypeScript files. */
export const restrictedSyntax: RestrictedSyntaxEntry[] = [
  {
    message: "Don't use the synchronous MathJax API; use a function like typesetPromise() instead.",
    selector:
      'CallExpression[callee.type="MemberExpression"][callee.object.name="MathJax"][callee.property.name=/^(typeset|tex2chtml|tex2svg)$/]',
  },
  {
    message: 'Use MathJax.typesetPromise() instead of MathJax.Hub',
    selector: 'MemberExpression[object.name="MathJax"][property.name="Hub"]',
  },
  {
    message: 'Use a default import instead of a namespace import for fs-extra',
    selector: 'ImportDeclaration[source.value="fs-extra"]:has(ImportNamespaceSpecifier)',
  },
  {
    message: 'Props with snake_case names are forbidden.',
    selector: 'JSXAttribute[name.name=/_/]',
  },
];

/** Additional restricted syntax for TypeScript files. */
export const typescriptRestrictedSyntax: RestrictedSyntaxEntry[] = [
  {
    message: 'module.exports should not be used in TypeScript files',
    selector: 'MemberExpression[object.name="module"][property.name="exports"]',
  },
  {
    message:
      "Specify a reply-mapping type argument, e.g. `new Redis<'legacy'>(...)`, to avoid expensive TypeScript inference.",
    selector: "NewExpression[callee.name='Redis']:not([typeArguments])",
  },
];

export interface PrairieLearnOxlintOptions {
  /**
   * Files that get the stricter type-aware rules, such as `no-unnecessary-condition` and
   * `no-misused-promises`. Other files still get every type-aware rule in the `correctness`
   * category.
   */
  strictTypeAwareFiles?: string[];
  /**
   * Playwright test files. Playwright's `use()` fixture function is misidentified as React's
   * `use` hook, so `react/rules-of-hooks` is disabled for these.
   */
  playwrightFiles?: string[];
  /** Project-specific restricted syntax, added to the shared entries for all files. */
  restrictedSyntax?: RestrictedSyntaxEntry[];
}

/**
 * Builds PrairieLearn's shared oxlint config. Use it from `oxlint.config.ts`:
 *
 * ```ts
 * import { defineConfig } from 'oxlint';
 * import { oxlintConfig } from '@prairielearn/oxlint-config';
 *
 * export default defineConfig({
 *   extends: [oxlintConfig({ strictTypeAwareFiles: ['src/**\/*.{ts,tsx}'] })],
 * });
 * ```
 */
export function oxlintConfig({
  strictTypeAwareFiles = [],
  playwrightFiles = [],
  restrictedSyntax: projectRestrictedSyntax = [],
}: PrairieLearnOxlintOptions = {}): OxlintConfig {
  const jsRestrictedSyntax: RuleEntry = ['error', ...restrictedSyntax, ...projectRestrictedSyntax];
  const tsRestrictedSyntax: RuleEntry = [
    'error',
    ...restrictedSyntax,
    ...typescriptRestrictedSyntax,
    ...projectRestrictedSyntax,
  ];

  return {
    // Every rule in the `correctness` category is on. Other rules are opted into below
    // only when they catch real bugs or enforce a convention we rely on.
    plugins: ['typescript', 'unicorn', 'oxc', 'react', 'jsx-a11y', 'vitest', 'jsdoc'],
    categories: {
      correctness: 'error',
    },
    jsPlugins: [
      jsPlugin('@prairielearn', '@prairielearn/eslint-plugin'),
      jsPlugin('@eslint-react', '@eslint-react/eslint-plugin'),
      jsPlugin('@html-eslint', '@html-eslint/eslint-plugin'),
      jsPlugin('@tanstack/query', '@tanstack/eslint-plugin-query'),
      jsPlugin('no-floating-promise', 'eslint-plugin-no-floating-promise'),
      jsPlugin('perfectionist', 'eslint-plugin-perfectionist'),
      jsPlugin(
        'react-you-might-not-need-an-effect',
        'eslint-plugin-react-you-might-not-need-an-effect',
      ),
      // `no-restricted-syntax` isn't implemented natively; this runs ESLint's own implementation.
      // It can't use the name `eslint`: https://github.com/oxc-project/oxc/issues/23695.
      jsPlugin('eslint-js', 'oxlint-plugin-eslint'),
    ],
    options: {
      typeAware: true,
      reportUnusedDisableDirectives: 'error',
      // `oxlint-disable` comments are for oxlint and `eslint-disable` comments are for
      // ESLint, so each tool can report its own unused directives.
      respectEslintDisableDirectives: false,
    },
    rules: {
      // Correctness rules that don't fit how we write code.
      'jsx-a11y/control-has-associated-label': 'off',
      'jsx-a11y/prefer-tag-over-role': 'off',
      'oxc/erasing-op': 'off', // Flags intentional `x * 0` in score tests and drawing math.
      'react/incompatible-library': 'off', // Only relevant with React Compiler, which we don't use.
      'react/preserve-manual-memoization': 'off', // Only relevant with React Compiler.
      // "Rules of React" checks that @eslint-react didn't run; enabling them needs refactoring.
      'react/immutability': 'off',
      'react/refs': 'off',
      'typescript/no-base-to-string': 'off',
      'typescript/no-misused-spread': 'off', // Spreading strings into characters is intentional.
      'typescript/no-useless-default-assignment': 'off',
      'typescript/require-array-sort-compare': 'off',
      // These are only enabled for `strictTypeAwareFiles`.
      'typescript/no-redundant-type-constituents': 'off',
      'typescript/restrict-template-expressions': 'off',
      'typescript/unbound-method': 'off',
      'vitest/expect-expect': 'off', // Most tests use `assert`.
      'vitest/no-conditional-tests': 'off',
      'vitest/require-mock-type-parameters': 'off',
      'vitest/require-to-throw-message': 'off',

      // Correctness rules that need options.
      'no-unused-vars': [
        'error',
        { args: 'after-used', argsIgnorePattern: '^_', varsIgnorePattern: '^_.' },
      ],
      'jsdoc/check-tag-names': ['error', { definedTags: ['knipignore'] }],

      // Likely bugs.
      eqeqeq: ['error', 'smart'],
      'no-case-declarations': 'error',
      'no-empty': 'error',
      'no-extend-native': 'error',
      'no-extra-bind': 'error',
      'no-fallthrough': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-new-wrappers': 'error',
      'no-proto': 'error',
      'no-prototype-builtins': 'error',
      'no-return-assign': 'error',
      'no-script-url': 'error',
      'no-self-compare': 'error',
      'no-sequences': 'error',
      'no-template-curly-in-string': 'error',
      'no-throw-literal': 'error',
      'no-unreachable-loop': 'error',
      'no-useless-call': 'error',
      'oxc/misrefactored-assign-op': 'error',
      'preserve-caught-error': 'error',
      'unicorn/new-for-builtins': 'error',
      'unicorn/no-accessor-recursion': 'error',
      'unicorn/no-array-fill-with-reference-type': 'error',
      'unicorn/no-instanceof-builtins': 'error',
      'unicorn/no-negation-in-equality-check': 'error',
      'unicorn/no-new-buffer': 'error',
      'unicorn/no-useless-promise-resolve-reject': 'error',
      'unicorn/prefer-number-properties': 'error',

      // TypeScript conventions.
      'typescript/array-type': 'error',
      'typescript/ban-ts-comment': ['error', { minimumDescriptionLength: 10 }],
      'typescript/consistent-indexed-object-style': 'error',
      'typescript/consistent-type-assertions': 'error',
      'typescript/consistent-type-definitions': 'error',
      'typescript/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      'typescript/no-confusing-non-null-assertion': 'error',
      'typescript/no-empty-object-type': 'error',
      'typescript/no-invalid-void-type': ['error', { allowAsThisParameter: true }],
      'typescript/no-namespace': 'error',
      'typescript/no-non-null-asserted-nullish-coalescing': 'error',
      'typescript/no-require-imports': 'error',
      'typescript/no-unnecessary-type-constraint': 'error',
      'typescript/no-unsafe-function-type': 'error',

      // General conventions.
      curly: ['error', 'multi-line', 'consistent'],
      'default-case-last': 'error',
      'default-param-last': 'error',
      'max-params': ['error', { max: 6 }],
      'no-alert': 'error',
      'no-console': ['error', { allow: ['warn', 'error', 'table', 'trace'] }],
      'no-duplicate-imports': 'error',
      'no-labels': 'error',
      // These are not available in ES modules.
      'no-restricted-globals': ['error', '__filename', '__dirname'],
      'no-var': 'error',
      'object-shorthand': 'error',
      'prefer-const': ['error', { destructuring: 'all' }],
      // oxfmt sorts import declarations but not the names within one.
      'sort-imports': [
        'error',
        {
          ignoreDeclarationSort: true,
          ignoreMemberSort: false,
          memberSyntaxSortOrder: ['none', 'all', 'multiple', 'single'],
        },
      ],
      'unicorn/no-abusive-eslint-disable': 'error',
      'unicorn/prefer-array-find': 'error',
      'unicorn/prefer-set-has': 'error',

      // React.
      'react/iframe-missing-sandbox': 'error',
      'react/jsx-curly-brace-presence': [
        'error',
        { children: 'never', propElementValues: 'always', props: 'never' },
      ],
      'react/jsx-no-comment-textnodes': 'error',
      'react/jsx-no-script-url': 'error',
      'react/jsx-no-target-blank': 'error',
      'react/no-array-index-key': 'error',
      'react/no-danger': 'error', // Each `dangerouslySetInnerHTML` needs a justified disable comment.
      'react/rules-of-hooks': 'error',
      'react/self-closing-comp': ['error', { component: true, html: true }],
      'jsx-a11y/anchor-ambiguous-text': 'error',
      // Bootstrap turns some elements into interactive elements.
      'jsx-a11y/no-noninteractive-element-to-interactive-role': [
        'error',
        {
          li: ['menuitem', 'option', 'row', 'tab', 'treeitem'],
          ol: ['listbox', 'menu', 'menubar', 'radiogroup', 'tablist', 'tree', 'treegrid'],
          table: ['grid'],
          td: ['gridcell'],
          ul: ['listbox', 'menu', 'menubar', 'radiogroup', 'tablist', 'tree', 'treegrid'],
        },
      ],
      'perfectionist/sort-jsx-props': [
        'error',
        {
          customGroups: [
            { elementNamePattern: '^on[A-Z]', groupName: 'callback' },
            { elementNamePattern: '^(key|ref)$', groupName: 'reserved' },
          ],
          groups: ['reserved', 'unknown', 'shorthand-prop', 'callback'],
          ignoreCase: true,
          type: 'unsorted',
        },
      ],
      'react-you-might-not-need-an-effect/no-adjust-state-on-prop-change': 'error',
      'react-you-might-not-need-an-effect/no-chain-state-updates': 'error',
      'react-you-might-not-need-an-effect/no-derived-state': 'error',
      'react-you-might-not-need-an-effect/no-external-store-subscription': 'error',
      'react-you-might-not-need-an-effect/no-initialize-state': 'error',
      'react-you-might-not-need-an-effect/no-pass-data-to-parent': 'error',
      'react-you-might-not-need-an-effect/no-pass-live-state-to-parent': 'error',
      'react-you-might-not-need-an-effect/no-reset-all-state-on-prop-change': 'error',
      // `@eslint-react` rules from its `recommended-typescript` preset that oxlint has no native
      // equivalent for.
      '@eslint-react/dom-no-flush-sync': 'error',
      '@eslint-react/dom-no-hydrate': 'error',
      '@eslint-react/dom-no-render': 'error',
      '@eslint-react/dom-no-use-form-state': 'error',
      '@eslint-react/jsx-no-children-prop-with-children': 'error',
      '@eslint-react/jsx-no-key-after-spread': 'error',
      '@eslint-react/jsx-no-namespace': 'error',
      '@eslint-react/naming-convention-context-name': 'error',
      '@eslint-react/naming-convention-id-name': 'error',
      '@eslint-react/naming-convention-ref-name': 'error',
      '@eslint-react/no-access-state-in-setstate': 'error',
      '@eslint-react/no-children-count': 'error',
      '@eslint-react/no-children-for-each': 'error',
      '@eslint-react/no-children-map': 'error',
      '@eslint-react/no-children-only': 'error',
      '@eslint-react/no-children-to-array': 'error',
      '@eslint-react/no-clone-element': 'error',
      '@eslint-react/no-component-will-mount': 'error',
      '@eslint-react/no-component-will-receive-props': 'error',
      '@eslint-react/no-component-will-update': 'error',
      '@eslint-react/no-context-provider': 'error',
      '@eslint-react/no-create-ref': 'error',
      '@eslint-react/no-forward-ref': 'error',
      '@eslint-react/no-nested-lazy-component-declarations': 'error',
      '@eslint-react/no-unnecessary-use-prefix': 'error',
      '@eslint-react/no-unused-class-component-members': 'error',
      '@eslint-react/no-use-context': 'error',
      '@eslint-react/rsc-function-definition': 'error',
      '@eslint-react/unsupported-syntax': 'error',
      '@eslint-react/web-api-no-leaked-event-listener': 'error',
      '@eslint-react/web-api-no-leaked-fetch': 'error',
      '@eslint-react/web-api-no-leaked-intersection-observer': 'error',
      '@eslint-react/web-api-no-leaked-interval': 'error',
      '@eslint-react/web-api-no-leaked-resize-observer': 'error',
      '@eslint-react/web-api-no-leaked-timeout': 'error',
      '@tanstack/query/infinite-query-property-order': 'error',
      '@tanstack/query/mutation-property-order': 'error',
      '@tanstack/query/no-rest-destructuring': 'error',
      '@tanstack/query/no-unstable-deps': 'error',
      '@tanstack/query/no-void-query-fn': 'error',
      '@tanstack/query/stable-query-client': 'error',

      // HTML in `html` tagged templates. Document-level rules (doctype, <title>, <meta>, ...)
      // are left out since templates render fragments.
      '@html-eslint/no-abstract-roles': 'error',
      '@html-eslint/no-accesskey-attrs': 'error',
      '@html-eslint/no-aria-hidden-on-focusable': 'error',
      '@html-eslint/no-duplicate-attrs': 'error',
      '@html-eslint/no-duplicate-class': 'error',
      '@html-eslint/no-empty-headings': 'error',
      '@html-eslint/no-extra-spacing-attrs': [
        'error',
        {
          disallowInAssignment: true,
          disallowMissing: true,
          disallowTabs: true,
          enforceBeforeSelfClose: true,
        },
      ],
      '@html-eslint/no-ineffective-attrs': 'error',
      '@html-eslint/no-invalid-attr-value': 'error',
      '@html-eslint/no-invalid-entity': 'error',
      '@html-eslint/no-invalid-role': 'error',
      '@html-eslint/no-nested-interactive': 'error',
      '@html-eslint/no-obsolete-attrs': 'error',
      '@html-eslint/no-obsolete-tags': 'error',
      '@html-eslint/no-positive-tabindex': 'error',
      '@html-eslint/no-redundant-role': 'error',
      '@html-eslint/no-script-style-type': 'error',
      '@html-eslint/no-target-blank': 'error',
      '@html-eslint/quotes': ['error', 'double', { enforceTemplatedAttrValue: true }],
      '@html-eslint/require-closing-tags': ['error', { selfClosing: 'always' }],
      '@html-eslint/require-details-summary': 'error',
      '@html-eslint/require-frame-title': 'error',
      '@html-eslint/require-img-alt': 'error',
      '@html-eslint/require-li-container': 'error',
      '@html-eslint/class-spacing': 'error',
      '@html-eslint/css-no-empty-blocks': 'error',
      '@html-eslint/lowercase': 'error',
      '@html-eslint/no-extra-spacing-text': 'error',
      '@html-eslint/no-multiple-empty-lines': 'error',
      '@html-eslint/no-multiple-h1': 'error',
      '@html-eslint/no-skip-heading-levels': 'error',
      '@html-eslint/no-whitespace-only-children': 'error',
      '@html-eslint/prefer-https': 'error',
      '@html-eslint/svg-require-viewbox': 'error',

      // PrairieLearn-specific rules.
      '@prairielearn/aws-client-mandatory-config': 'error',
      '@prairielearn/aws-client-shared-config': 'error',
      // PrairieLearn elements treat `id` as an element-scoped identifier, not a DOM id.
      '@prairielearn/html-no-duplicate-id': 'error',
      '@prairielearn/jsx-no-dollar-interpolation': 'error',
      '@prairielearn/no-current-target-in-callback': 'error',
      '@prairielearn/no-hydrate-reslocals': 'error',
      '@prairielearn/no-unused-sql-blocks': 'error',
      // `@prairielearn/safe-db-types` needs type information, which oxlint doesn't provide to
      // JS plugins (https://github.com/oxc-project/oxc/issues/19596), so ESLint runs it.
    },
    overrides: [
      // Top-level `env` and `settings` aren't inherited through `extends`, but overrides are.
      { files: ['**/*'], env: { node: true } },
      ...(strictTypeAwareFiles.length > 0
        ? [
            {
              files: strictTypeAwareFiles,
              rules: {
                'typescript/no-deprecated': 'error',
                'typescript/no-misused-promises': [
                  'error',
                  {
                    checksConditionals: true,
                    checksSpreads: true,
                    // These are common and intentional with async event handlers and callbacks.
                    checksVoidReturn: {
                      arguments: false,
                      attributes: false,
                      inheritedMethods: true,
                      properties: false,
                      returns: true,
                      variables: true,
                    },
                  },
                ],
                'typescript/no-unnecessary-condition': [
                  'error',
                  { allowConstantLoopConditions: 'only-allowed-literals' },
                ],
                'typescript/no-unnecessary-type-assertion': 'error',
                'typescript/no-unsafe-enum-comparison': 'error',
                'typescript/only-throw-error': [
                  'error',
                  {
                    allow: [{ from: 'file', name: 'HttpRedirect' }],
                    allowRethrowing: true,
                    allowThrowingAny: true,
                    allowThrowingUnknown: true,
                  },
                ],
                'typescript/prefer-optional-chain': 'error',
                'typescript/restrict-plus-operands': 'error',
                'typescript/no-redundant-type-constituents': 'error',
                'typescript/restrict-template-expressions': [
                  'error',
                  {
                    allow: [{ from: 'lib', name: ['Error', 'URL', 'URLSearchParams'] }],
                    allowAny: true,
                    allowBoolean: true,
                    allowNullish: true,
                    allowNumber: true,
                    allowRegExp: true,
                  },
                ],
                'typescript/unbound-method': 'error',
              },
            } satisfies NonNullable<OxlintConfig['overrides']>[number],
          ]
        : []),
      {
        // Plain JS files have no type information, so use a syntactic floating-promise check.
        files: ['**/*.{js,jsx,mjs,cjs}'],
        rules: {
          'no-floating-promise/no-floating-promise': 'error',
          'typescript/no-floating-promises': 'off',
          'eslint-js/no-restricted-syntax': jsRestrictedSyntax,
        },
      },
      {
        files: ['**/*.{ts,tsx,mts,cts}'],
        rules: {
          'eslint-js/no-restricted-syntax': tsRestrictedSyntax,
          'no-restricted-imports': [
            'error',
            {
              paths: [
                {
                  importNames: ['OverlayTrigger'],
                  message: 'Use OverlayTrigger from @prairielearn/ui.',
                  name: 'react-bootstrap',
                },
              ],
            },
          ],
        },
      },
      {
        files: ['**/src/trpc/**/*.ts'],
        rules: {
          '@prairielearn/require-trpc-permission-middleware': 'error',
          // We use empty object types for typed errors in tRPC subrouters.
          // This is intended to force the client to reference the error type.
          'typescript/no-empty-object-type': ['error', { allowInterfaces: 'always' }],
        },
      },
      ...(playwrightFiles.length > 0
        ? [{ files: playwrightFiles, rules: { 'react/rules-of-hooks': 'off' as const } }]
        : []),
    ],
  };
}
