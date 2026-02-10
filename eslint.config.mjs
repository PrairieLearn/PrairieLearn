/* eslint perfectionist/sort-objects: error */
// @ts-check
import path from 'path';

import html from '@html-eslint/eslint-plugin';
import htmlParser from '@html-eslint/parser';
import { globalIgnores } from 'eslint/config';
import globals from 'globals';

import { prairielearn } from '@prairielearn/eslint-config';

const NO_RESTRICTED_SYNTAX = [
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
];

export default [
  // Use the shared PrairieLearn ESLint config
  ...prairielearn({
    allowDefaultProject: ['playwright.config.ts', 'vite.config.ts', 'vitest.config.ts'],
    prairieLearnOptions: {
      allowDbTypes: [
        // This is innocuous, it's just a string enum.
        'SprocUsersGetDisplayedRoleSchema',
        // This is also just an enum.
        'EnumAiQuestionGenerationMessageStatus',
      ],
    },
    tsconfigRootDir: path.join(import.meta.dirname, 'apps', 'prairielearn'),
    typeAwareFiles: ['apps/prairielearn/**/*.{ts,tsx}'],
  }),

  // HTML plugin
  {
    plugins: {
      '@html-eslint': html,
    },
    rules: {
      // Use the recommended rules for HTML.
      ...Object.fromEntries(
        Object.keys(html.rules).map((value) => ['@html-eslint/' + value, 'error']),
      ),
      // We don't want these style rules
      '@html-eslint/attrs-newline': 'off',
      '@html-eslint/element-newline': 'off',
      '@html-eslint/indent': 'off',
      '@html-eslint/no-inline-styles': 'off',
      '@html-eslint/no-trailing-spaces': 'off',
      '@html-eslint/sort-attrs': 'off',
      // We don't want these rules
      '@html-eslint/no-heading-inside-button': 'off', // not important
      '@html-eslint/require-explicit-size': 'off', // we don't always have sizes when we use classes.
      '@html-eslint/require-form-method': 'off', // default is 'GET', that's fine.
      '@html-eslint/require-input-label': 'off', // we don't always have labels.
      // We prefer tags like `<img />` over `<img>`.
      '@html-eslint/no-extra-spacing-attrs': [
        'error',
        {
          disallowInAssignment: true,
          disallowMissing: true,
          disallowTabs: true,
          enforceBeforeSelfClose: true,
        },
      ],
      '@html-eslint/require-closing-tags': ['error', { selfClosing: 'always' }],
      // False positives for attribute/element baseline browser compatibility.
      '@html-eslint/use-baseline': 'off',
      // We violate these rules in a lot of places.
      '@html-eslint/id-naming-convention': 'off',
      '@html-eslint/quotes': ['error', 'double', { enforceTemplatedAttrValue: true }],
    },
  },
  {
    files: ['**/*.{js,jsx,mjs,cjs}'],
    rules: {
      'no-restricted-syntax': ['error', ...NO_RESTRICTED_SYNTAX],
    },
  },
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...NO_RESTRICTED_SYNTAX,
        {
          message: 'module.exports should not be used in TypeScript files',
          selector: 'MemberExpression[object.name="module"][property.name="exports"]',
        },
      ],
    },
  },

  // HTML rules in JS/TS files
  {
    files: ['**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}'],
    rules: {
      // Use the recommended rules for HTML.
      ...Object.fromEntries(
        Object.keys(html.rules).map((value) => ['@html-eslint/' + value, 'error']),
      ),
      // We don't want these style rules
      '@html-eslint/attrs-newline': 'off',
      '@html-eslint/element-newline': 'off',
      '@html-eslint/indent': 'off',
      '@html-eslint/no-inline-styles': 'off',
      '@html-eslint/no-trailing-spaces': 'off',
      '@html-eslint/sort-attrs': 'off',
      // We don't want these rules
      '@html-eslint/no-heading-inside-button': 'off', // not important
      '@html-eslint/require-explicit-size': 'off', // we don't always have sizes when we use classes.
      '@html-eslint/require-form-method': 'off', // default is 'GET', that's fine.
      '@html-eslint/require-input-label': 'off', // we don't always have labels.
      // We prefer tags like `<img />` over `<img>`.
      '@html-eslint/no-extra-spacing-attrs': ['error', { enforceBeforeSelfClose: true }],
      '@html-eslint/require-closing-tags': ['error', { selfClosing: 'always' }],
      // False positives for attribute/element baseline browser compatibility.
      '@html-eslint/use-baseline': 'off',
      // We violate these rules in a lot of places.
      '@html-eslint/id-naming-convention': 'off',
      '@html-eslint/require-button-type': 'off',
    },
  },

  {
    files: ['**/*.{ts,tsx}'],
    rules: {
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
    files: ['apps/prairielearn/src/models/**/*'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/safe-db-types.js'],
              message:
                'Import from db-types instead of safe-db-types in the models directory. Otherwise, this code should live in the lib directory.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/prairielearn/assets/scripts/**/*', 'apps/prairielearn/elements/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.jquery,
      },
    },
  },
  {
    files: ['apps/prairielearn/src/tests/**/*', 'scripts/**/*', 'contrib/**/*'],
    rules: {
      'no-console': 'off',
    },
  },
  {
    files: ['**/*.html', '**/*.mustache'],
    languageOptions: {
      parser: htmlParser,
      parserOptions: {
        templateEngineSyntax: htmlParser.TEMPLATE_ENGINE_SYNTAX.HANDLEBAR,
      },
    },
    rules: {
      '@html-eslint/no-extra-spacing-text': 'off',
      // We prefer tags like `<img>` over `<img />`.
      '@html-eslint/require-closing-tags': ['error', { selfClosing: 'never' }],
    },
  },
  {
    files: ['**/*.mustache'],
    rules: {
      '@html-eslint/no-extra-spacing-attrs': 'off',
      // We are inconsistent about whether we use self-closing tags or not.
      '@html-eslint/require-closing-tags': 'off',
      // False positive
      '@html-eslint/no-duplicate-id': 'off',
      // False positive (https://github.com/yeonjuan/html-eslint/issues/392)
      '@html-eslint/no-duplicate-attrs': 'off',
      // False positive (alt added via bootstrap)
      '@html-eslint/require-img-alt': 'off',
      // Issue in 'pl-matrix-input'
      '@html-eslint/no-nested-interactive': 'off',
    },
  },
  globalIgnores([
    '.venv/*',
    '.yarn/*',
    'docs/*',
    'node_modules/*',
    'testCourse',
    'exampleCourse/**/*.{js,html}',
    'coverage/*',
    'out/*',
    'workspaces/*',
    'site/*',

    // Coverage reports
    'coverage/*',
    'apps/*/coverage/*',
    'packages/*/coverage/*',

    // We don't want to lint these files.
    'apps/prairielearn/v2-question-servers/*',
    'apps/prairielearn/public/*',

    // Transpiled code
    'apps/*/dist/*',
    'apps/prairielearn/public/build/*',
    'packages/*/dist/*',
  ]),
];
