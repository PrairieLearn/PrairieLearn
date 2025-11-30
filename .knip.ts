import { readFile } from 'fs/promises';

import { globby } from 'globby';
import type { KnipConfig } from 'knip';

const usedExampleDependencies = [
  ...(await globby('{exampleCourse,testCourse}/**/info.json')),
  ...(await globby('apps/prairielearn/elements/**/info.json')),
];

const questionAndElementConfigFiles = await Promise.all(
  usedExampleDependencies.map(async (path) => {
    const content = await readFile(path, 'utf-8');
    return JSON.parse(content);
  }),
);

const questionAndElementDependencies = questionAndElementConfigFiles.flatMap((infoJson) => [
  ...(infoJson.dependencies?.nodeModulesStyles ?? []),
  ...(infoJson.dependencies?.nodeModulesScripts ?? []),
  ...Object.values(infoJson.dynamicDependencies?.nodeModulesScripts ?? {}),
]);

const sourceFiles = await globby('apps/prairielearn/**/*.{ts,tsx}');
const assetPathRegex = /nodeModulesAssetPath\([\n ]*'(.*)',?[\n ]*\)/g;

const sourceFileDependencies = await Promise.all(
  sourceFiles.map(async (path) => {
    const content = await readFile(path, 'utf-8');
    const matches = [...content.matchAll(assetPathRegex)].map((match) => match[1]);
    return matches;
  }),
);

const packageDependencies = new Set<string>(
  [...questionAndElementDependencies, ...sourceFileDependencies].flat().map((dep) => {
    const parts = dep.split('/');
    if (parts[0].startsWith('@')) {
      return parts.slice(0, 2).join('/');
    }
    return parts[0];
  }),
);

const config: KnipConfig = {
  workspaces: {
    '.': {
      entry: [],
      project: [],
      // https://knip.dev/guides/configuring-project-files#ignore-issues-in-specific-files
      ignore: ['vitest.config.ts', 'eslint.config.mjs'],
    },
    'apps/prairielearn': {
      // https://knip.dev/guides/handling-issues#dynamic-import-specifiers
      entry: [
        'src/server.ts',
        'assets/scripts/**/*.{ts,tsx}',
        'src/{batched-migrations,migrations}/*.{ts,mts}',
        'src/admin_queries/*.ts',
        'src/executor.ts',
        'src/question-servers/calculation-worker.ts',
      ],
      ignore: [
        'src/lib/no-deprecated-sql.d.ts',
        'src/ee/pages/instructorAiGenerateDraftEditor/RichTextEditor/extensions/react-rendered-component-sample.tsx',
        'src/lib/client/safe-db-types.ts',
      ],
      project: ['**/*.{ts,cts,mts,tsx}'],
    },
    'apps/workspace-host': {
      entry: ['src/interface.ts'],
      project: ['**/*.{ts,cts,mts,tsx}'],
    },
    'apps/grader-host': {
      project: ['**/*.{ts,cts,mts,tsx}'],
    },
    'packages/preact-cjs-compat': {
      entry: ['src/jsx-runtime.js'],
      project: ['**/*.{ts,cts,mts,tsx}'],
    },
    'packages/preact-cjs': {
      entry: ['src/*.js'],
      project: ['**/*.{ts,cts,mts,tsx}'],
    },
    'packages/migrations': {
      entry: ['src/{batched-migrations,migrations}/fixtures/*.ts'],
      project: ['**/*.{ts,cts,mts,tsx}'],
    },
    'packages/session': {
      entry: ['src/test-utils.ts'],
      project: ['**/*.{ts,cts,mts,tsx}'],
    },
    'packages/tsconfig': {
      entry: [],
      project: [],
    },
    'packages/markdown': {
      entry: ['src/benchmark.ts'],
      project: ['**/*.{ts,cts,mts,tsx}'],
    },
  },
  ignoreDependencies: [
    ...[...packageDependencies].filter(
      (dep) =>
        // False positives, as we rely on these packages for our own code as well.
        ![
          'd3',
          'marked',
          'clipboard',
          'async',
          'tom-select',
          'qrcode-svg',
          'socket.io-client',
          'lodash',
          'ace-builds',
          'bootstrap-table',
          'bootstrap',
          'jquery',
          'highlight.js',
        ].includes(dep),
    ),
    'backbone',
    'mersenne',
    'numeric',
    'popper.js',
    // Used as CLI tools
    'htmlhint',
    'markdownlint-cli',
    'pyright',
    's3rver',
  ],
  exclude: ['binaries', 'dependencies', 'exports', 'types'],
};

export default config;
