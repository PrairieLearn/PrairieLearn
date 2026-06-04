import { readFile } from 'fs/promises';

import { globby } from 'globby';
import type { KnipConfig } from 'knip';

/**
 * How dependency detection works in this repo
 * --------------------------------------------
 * Knip walks our source files and reports any `dependencies` in `package.json`
 * that it doesn't see imported. That works for normal `import` statements, but
 * we also pull packages in several ways knip can't see:
 *
 *   1. `nodeModulesAssetPath('pkg/...')` calls in TS/TSX, which serve files
 *      from `node_modules` at request time.
 *   2. `dependencies.nodeModulesScripts` / `nodeModulesStyles` /
 *      `dynamicDependencies.nodeModulesScripts` entries in element / question
 *      `info.json` files.
 *
 * Without help, knip reports every package used only via 1 or 2 as unused.
 * To work around this, we scan those files at config-load time, extract the
 * package names, and add them to `ignoreDependencies` so knip leaves them
 * alone. See https://github.com/webpro-nl/knip/issues/641 and
 * https://github.com/webpro-nl/knip/pull/1220 for the upstream feature gap.
 *
 * On top of the auto-collected set, three manually maintained lists cover
 * cases the scan can't get right. Each list below documents the case it
 * handles.
 */

/**
 * Packages our scan picks up via `nodeModulesAssetPath()` / `info.json`, but
 * which are *also* imported normally elsewhere in the codebase. If we let
 * `ignoreDependencies` cover them, knip would warn "you're ignoring a
 * dependency that's actually used" — a false alarm. We strip them from the
 * auto-detected set so knip tracks them through their real imports and will
 * flag them if those imports go away.
 */
const AUTO_DETECTED_BUT_ALSO_IMPORTED = [
  'd3',
  'he',
  'marked',
  'qrcode-svg',
  'socket.io-client',
  'ace-builds',
  'bootstrap',
  'jquery',
  'mathlive',
  'highlight.js',
  'web-tree-sitter',
];

/**
 * Packages that are only reachable from source files knip considers dead.
 * Knip would normally flag them as unused; we keep them installed because the
 * referencing code still ships. Remove an entry once the referencing file is
 * either deleted or wired back into a live entry point.
 */
const DEPS_OF_DEAD_CODE = ['@tiptap/extension-code-block'];

/**
 * Packages that no first-party code in this repo imports, but that we ship so
 * elements in *external* course repositories can use them at runtime. The
 * info.json scan only sees this repo's courses, so these have to be listed by
 * hand.
 */
const EXTERNAL_ELEMENT_DEPS = [
  'backbone',
  'clipboard',
  'dropzone',
  'lodash',
  'mersenne',
  'numeric',
  'popper.js',
  'showdown',
];

/**
 * Packages we install only for the CLI binary they ship (invoked from
 * Makefile / scripts / CI). They have no `import` site, so knip can't see the
 * usage.
 */
const CLI_ONLY_DEPS = [
  'linkinator',
  'htmlhint',
  'markdownlint-cli2',
  'pyright',
  's3rver',
  '@postgres-language-server/cli',
  '@typescript/native-preview',
];

// Collect packages referenced by element / question `info.json` files.
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

// Collect packages referenced by `nodeModulesAssetPath('pkg/...')` calls in
// TS / TSX source. Example match: `nodeModulesAssetPath('highlight.js/styles/default.css')`.
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

// Reduce full asset paths down to package names. e.g.
//   "lodash/lodash.min.js"            -> "lodash"
//   "@fortawesome/fontawesome/...css" -> "@fortawesome/fontawesome"
const autoDetectedDeps = new Set<string>(
  [...infoJsonDependencies, ...sourceFileDependencies].map((dep) => {
    const parts = dep.split('/');
    if (parts[0].startsWith('@')) {
      return parts.slice(0, 2).join('/');
    }
    return parts[0];
  }),
);

// Hand back to knip the deps that have a real import site, so it can keep
// tracking them.
const staleAutoDetectedEntries = AUTO_DETECTED_BUT_ALSO_IMPORTED.filter(
  (dep) => !autoDetectedDeps.has(dep),
);
if (staleAutoDetectedEntries.length > 0) {
  throw new Error(
    "AUTO_DETECTED_BUT_ALSO_IMPORTED contains entries that aren't auto-detected: " +
      `${staleAutoDetectedEntries.join(', ')}. Remove them or move to another list.`,
  );
}
for (const dep of AUTO_DETECTED_BUT_ALSO_IMPORTED) {
  autoDetectedDeps.delete(dep);
}

const config: KnipConfig = {
  tags: ['-knipignore'],
  treatConfigHintsAsErrors: true,
  workspaces: {
    '.': {
      entry: ['scripts/*.{mts,mjs}', 'contrib/*.{mts,mjs}'],
      project: ['scripts/*.{mts,mjs}', 'contrib/*.{mts,mjs}'],
      // https://knip.dev/guides/configuring-project-files#ignore-issues-in-specific-files
      ignore: ['vitest.config.ts'],
      ignoreDependencies: ['@prairielearn/tsconfig', ...CLI_ONLY_DEPS],
    },
    'apps/prairielearn': {
      // https://knip.dev/guides/handling-issues#dynamic-import-specifiers
      entry: [
        'assets/scripts/**/*.{ts,tsx}',
        'src/lib/element-schemas/htmlmustache-plugin.ts',
        'src/{batched-migrations,migrations}/*.{ts,mts}',
        'src/admin_queries/*.ts',
        'src/executor.ts',
        'src/question-servers/calculation-worker.ts',
      ],
      ignore: [
        'src/ee/pages/instructorAiGenerateDraftEditor/RichTextEditor/extensions/react-rendered-component-sample.tsx',
        // We have lots of aliases in this file
        'src/lib/client/safe-db-types.ts',
        // We have team -> group aliases in this file
        'src/lib/db-types.ts',
        // Ambient module declaration for echarts types
        'src/typings/echarts.d.ts',
      ],
      project: ['**/*.{ts,cts,mts,tsx}'],
      // Tell knip not to flag these as unused.
      ignoreDependencies: [...autoDetectedDeps, ...EXTERNAL_ELEMENT_DEPS, ...DEPS_OF_DEAD_CODE],
    },
    'apps/workspace-host': {
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
    'packages/bind-mount': {
      ignoreDependencies: ['nan'],
    },
    'packages/eslint-config': {
      // Loaded dynamically by eslint-plugin-import-x via the
      // `'import-x/resolver': { typescript: true }` setting.
      ignoreDependencies: ['eslint-import-resolver-typescript'],
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

  // TODO: enable these features
  exclude: ['binaries'],
};

export default config;
