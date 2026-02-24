import { readFile } from 'fs/promises';

import { globby } from 'globby';
import type { KnipConfig } from 'knip';

// These packages are used in our own code, outside of nodeModulesAssetPath() calls.
// Thus, we want to track their usage instead of ignoring them.
// TODO: We might want to re-evaluate this approach.
const REFERENCED_NODE_MODULES_DEPS = [
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
];

// These packages aren't used in our own code, but we still want them installed
// as they are used by elements in other courses.
const _FALSE_NEGATIVE_ELEMENT_DEPS = ['backbone', 'mersenne', 'numeric', 'popper.js'];

// These packages are just used for their CLI tools, so we still want them installed.
const _FALSE_NEGATIVE_CLI_DEPS = ['htmlhint', 'markdownlint-cli2', 'pyright', 's3rver'];

// We want extract all dependencies of our elements, and mark them as used.
// See https://github.com/webpro-nl/knip/issues/641 and https://github.com/webpro-nl/knip/pull/1220
// for why we need to manually extract dependencies and ignore them.
const infoJsonPaths = await globby(
  '{exampleCourse,testCourse,apps/prairielearn/elements}/**/info.json',
);

const infoJsonContents = await Promise.all(
  infoJsonPaths.map(async (path) => {
    const content = await readFile(path, 'utf-8');
    return JSON.parse(content);
  }),
);

const infoJsonDependencies = infoJsonContents.flatMap((infoJson) => [
  ...(infoJson.dependencies?.nodeModulesStyles ?? []),
  ...(infoJson.dependencies?.nodeModulesScripts ?? []),
  ...Object.values(infoJson.dynamicDependencies?.nodeModulesScripts ?? {}),
]);

// Since knip can't track these normally, we manually extract them from the source code.
// For instance, this matches nodeModulesAssetPath('highlight.js/styles/default.css')
const assetPathRegex = /nodeModulesAssetPath\(\s*'([^']*)'\s*\)/g;

const sourceFiles = await globby('apps/prairielearn/**/*.{ts,tsx}');
const sourceFileDependencies = (
  await Promise.all(
    sourceFiles.map(async (path) => {
      const content = await readFile(path, 'utf-8');
      return [...content.matchAll(assetPathRegex)].map((match) => match[1]);
    }),
  )
).flat();

// Extract package names from full dependency paths (e.g. "lodash/lodash.min.js" -> "lodash").
const packageDependencies = new Set<string>(
  [...infoJsonDependencies, ...sourceFileDependencies].map((dep) => {
    const parts = dep.split('/');
    if (parts[0].startsWith('@')) {
      return parts.slice(0, 2).join('/');
    }
    return parts[0];
  }),
);

for (const dep of REFERENCED_NODE_MODULES_DEPS) {
  packageDependencies.delete(dep);
}

const config: KnipConfig = {
  tags: ['-knipignore'],
  workspaces: {
    '.': {
      entry: ['scripts/*.{mts,mjs}'],
      project: ['scripts/*.{mts,mjs}'],
      // https://knip.dev/guides/configuring-project-files#ignore-issues-in-specific-files
      ignore: ['vitest.config.ts', 'eslint.config.mjs'],
    },
    'apps/prairielearn': {
      // https://knip.dev/guides/handling-issues#dynamic-import-specifiers
      entry: [
        'assets/scripts/**/*.{ts,tsx}',
        'src/{batched-migrations,migrations}/*.{ts,mts}',
        'src/admin_queries/*.ts',
        'src/executor.ts',
        'src/question-servers/calculation-worker.ts',
      ],
      ignore: [
        'src/lib/no-deprecated-sql.d.ts',
        'src/ee/pages/instructorAiGenerateDraftEditor/RichTextEditor/extensions/react-rendered-component-sample.tsx',
        // We have lots of aliases in this file
        'src/lib/client/safe-db-types.ts',
        // We have team -> group aliases in this file
        'src/lib/db-types.ts',
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
    'packages/*': {
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
  // knip will not report these dependencies as unused.
  ignoreDependencies: [
    // ...packageDependencies,
    // ...FALSE_NEGATIVE_ELEMENT_DEPS,
    // ...FALSE_NEGATIVE_CLI_DEPS,
  ],
  // TODO: enable these features
  exclude: ['binaries', 'dependencies', 'unlisted'],
};

export default config;
