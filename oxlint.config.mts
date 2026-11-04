import { defineConfig } from 'oxlint';

import { oxlintConfig, restrictedSyntax } from '@prairielearn/oxc-config';

const elementImportMessage =
  'Element code must not import from outside its own directory. Use a public API or copy the implementation locally.';

export default defineConfig({
  extends: [
    oxlintConfig({
      // Other apps and packages haven't been brought up to the stricter type-aware rules yet.
      strictTypeAwareFiles: ['apps/prairielearn/**/*.{ts,tsx}'],
      playwrightFiles: ['apps/prairielearn/src/tests/e2e/**/*'],
    }),
  ],
  overrides: [
    {
      files: ['apps/prairielearn/elements/**/*.{js,mjs,cjs}'],
      rules: {
        'eslint-js/no-restricted-syntax': [
          'error',
          ...restrictedSyntax,
          {
            message: elementImportMessage,
            selector: 'ImportExpression[source.value=/(^|\\/)\\.\\.(\\/|$)/]',
          },
          {
            message: elementImportMessage,
            selector:
              'ImportExpression[source.type="TemplateLiteral"] TemplateElement[value.raw=/(^|\\/)\\.\\.(\\/|$)/]',
          },
        ],
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              { message: elementImportMessage, regex: '(?:^|[\\\\/])\\.\\.(?:[\\\\/]|$)' },
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
      env: { browser: true, jquery: true },
    },
    {
      files: ['apps/prairielearn/src/tests/**/*', 'scripts/**/*', 'contrib/**/*'],
      rules: { 'no-console': 'off' },
    },
    {
      // Keep these large, frequently edited object literals sorted.
      files: [
        'apps/prairielearn/src/lib/client/safe-db-types.test.ts',
        'apps/prairielearn/src/lib/client/safe-db-types.ts',
        'apps/prairielearn/src/lib/db-types.ts',
      ],
      rules: {
        'perfectionist/sort-objects': ['error', { partitionByComment: true, type: 'natural' }],
      },
    },
    {
      files: [
        'apps/prairielearn/src/ee/pages/instructorAiGenerateDraftEditor/RichTextEditor/index.tsx',
        'apps/prairielearn/src/lib/db-types.ts',
      ],
      rules: {
        'perfectionist/sort-sets': ['error', { partitionByComment: true, type: 'natural' }],
      },
    },
  ],
  ignorePatterns: [
    '.claude/worktrees/*',
    '.playwright-mcp/*',
    '.venv/*',
    'coverage/*',
    'docs/*',
    'exampleCourse/**/*.js',
    'out/*',
    'site/*',
    'test-results/*',
    'testCourse',
    'workspaces/*',
    'apps/*/coverage/*',
    'apps/*/dist/*',
    'apps/course-agent/.wrangler/*',
    // Wrangler owns this declaration, including its generated lint directives.
    'apps/course-agent/src/env.d.ts',
    'apps/course-agent/generated/**',
    'apps/prairielearn/playwright/.cache/*',
    'apps/prairielearn/public/*',
    'apps/prairielearn/test-results/*',
    'apps/prairielearn/v2-question-servers/*',
    'packages/*/coverage/*',
    'packages/*/dist/*',
  ],
});
