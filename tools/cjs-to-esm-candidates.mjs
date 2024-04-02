// @ts-check
import fs from 'node:fs/promises';
import path from 'node:path';
import globby from 'globby';
import { parse } from '@typescript-eslint/parser';

// These modules have their types declared as `export = ...`, so we can't use
// `import` to load them until we're using native ESM.
const CJS_ONLY_MODULES = new Set([
  'archiver',
  'assert',
  'async-stacktrace',
  'axe-core',
  'body-parser',
  'byline',
  'cookie-parser',
  'crypto-js/sha256',
  'csvtojson',
  'dockerode',
  'events',
  'execa',
  'express',
  'express-async-handler',
  'express-list-endpoints',
  'form-data',
  'get-port',
  'json-stable-stringify',
  'json-stringify-safe',
  'klaw',
  'lodash',
  'loopbench',
  'oauth-signature',
  'node:assert',
  'passport',
  'postgres-interval',
  'qrcode-svg',
  'request',
  'search-string',
  'strip-ansi',
  'winston',
  'winston-transport',
  // Relative paths to PrairieLearn files.
  'apps/grader-host/src/lib/logger',
  'apps/prairielearn/src/middlewares/authzCourseOrInstance',
  'apps/prairielearn/src/middlewares/authzIsAdministrator',
  'apps/prairielearn/src/middlewares/logPageView',
  'apps/prairielearn/src/middlewares/staticNodeModules',
  'apps/prairielearn/src/pages/elementFiles/elementFiles',
]);

function maybeLogLocation(filePath, node, modulePath) {
  let resolvedModulePath = modulePath;
  if (modulePath.startsWith('.')) {
    resolvedModulePath = path.relative(
      process.cwd(),
      path.resolve(path.dirname(filePath), modulePath),
    );
  }
  if (CJS_ONLY_MODULES.has(resolvedModulePath)) return;

  console.log(`${filePath}:${node.loc.start.line}:${node.loc.start.column}: ${modulePath}`);
}

const importEqualsOnly = process.argv.includes('--import-equals-only');
const filesWithImportsOnly = process.argv.includes('--files-with-imports-only');

const files = await globby(['apps/*/src/**/*.{js,ts}']);

for (const file of files.sort()) {
  const contents = await fs.readFile(file, 'utf-8');
  const ast = parse(contents, {
    range: true,
    loc: true,
    tokens: false,
  });

  const fileHasImports = ast.body.some(
    (node) =>
      node.type === 'ImportDeclaration' ||
      (node.type === 'TSImportEqualsDeclaration' &&
        node.moduleReference.type === 'TSExternalModuleReference'),
  );

  if (filesWithImportsOnly && !fileHasImports) continue;

  ast.body.forEach((node) => {
    // Handle `require()` calls.
    if (node.type === 'VariableDeclaration' && !importEqualsOnly) {
      node.declarations.forEach((declaration) => {
        if (
          declaration.init?.type === 'CallExpression' &&
          declaration.init.callee?.type === 'Identifier' &&
          declaration.init.callee.name === 'require' &&
          declaration.init.arguments[0].type === 'Literal'
        ) {
          const modulePath = declaration.init.arguments[0].value;
          maybeLogLocation(file, node, modulePath);
        }
      });
    }

    // Handle `import ... = require(...)` statements.
    if (
      node.type === 'TSImportEqualsDeclaration' &&
      node.moduleReference.type === 'TSExternalModuleReference' &&
      node.moduleReference.expression.type === 'Literal'
    ) {
      const modulePath = node.moduleReference.expression.value;
      maybeLogLocation(file, node, modulePath);
    }
  });
}
