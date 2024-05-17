// @ts-check
import fs from 'node:fs/promises';
import path from 'node:path';
import { globby } from 'globby';
import { parse } from '@typescript-eslint/parser';

// These modules have their types declared as `export = ...`, so we can't use
// `import` to load them until we're using native ESM.
const CJS_ONLY_MODULES = new Set([
  'archiver',
  'assert',
  'async-stacktrace',
  'axe-core',
  'blocked',
  'blocked-at',
  'body-parser',
  'byline',
  'chalk',
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
  'http-status',
  'json-stable-stringify',
  'json-stringify-safe',
  'klaw',
  'loopbench',
  'multer',
  'oauth-signature',
  'object-hash',
  'on-finished',
  'memorystream',
  'node:assert',
  'passport',
  'postgres-interval',
  'qrcode-svg',
  'request',
  'requirejs',
  'search-string',
  'serve-favicon',
  'strip-ansi',
  'winston',
  'winston-transport',
  'yargs-parser',
  // Unified ecosystem and related packages.
  'unified',
  'remark-parse',
  'rehype-raw',
  'remark-gfm',
  'remark-rehype',
  'remark-math',
  'rehype-stringify',
  'rehype-sanitize',
  'unist-util-visit',
]);

const candidatesPerFileCount = new Map();

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
  candidatesPerFileCount.set(filePath, (candidatesPerFileCount.get(filePath) ?? 0) + 1);
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
        // Handle `const foo = require(...)` statements.
        if (
          declaration.init?.type === 'CallExpression' &&
          declaration.init.callee?.type === 'Identifier' &&
          declaration.init.callee.name === 'require' &&
          declaration.init.arguments[0].type === 'Literal'
        ) {
          const modulePath = declaration.init.arguments[0].value;
          maybeLogLocation(file, node, modulePath);
        }

        // Handle `const foo = require(...)()` statements.
        if (
          declaration.init?.type === 'CallExpression' &&
          declaration.init.callee?.type === 'CallExpression' &&
          declaration.init.callee.callee?.type === 'Identifier' &&
          declaration.init.callee.callee.name === 'require' &&
          declaration.init.callee.arguments[0].type === 'Literal'
        ) {
          const modulePath = declaration.init.callee.arguments[0].value;
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

    // Handle `module.exports = ...` and `module.exports.foo = ...` statements.
    if (
      node.type === 'ExpressionStatement' &&
      node.expression.type === 'AssignmentExpression' &&
      node.expression.left.type === 'MemberExpression'
    ) {
      if (
        (node.expression.left.object.type === 'Identifier' &&
          node.expression.left.object.name === 'module' &&
          node.expression.left.property.type === 'Identifier' &&
          node.expression.left.property.name === 'exports') ||
        (node.expression.left.object.type === 'MemberExpression' &&
          node.expression.left.object.object.type === 'Identifier' &&
          node.expression.left.object.object.name === 'module' &&
          node.expression.left.object.property.type === 'Identifier' &&
          node.expression.left.object.property.name === 'exports')
      ) {
        const left = contents.substring(
          node.expression.left.range[0],
          node.expression.left.range[1],
        );
        maybeLogLocation(file, node, left);
      }
    }
  });
}

if (candidatesPerFileCount.size > 0) {
  console.log(`\n\nSummary (${candidatesPerFileCount.size} files):`);

  const sortedCandidates = [...candidatesPerFileCount.entries()].sort(
    (a, b) => a[1] - b[1] || a[0].localeCompare(b[0]),
  );
  for (const [file, count] of sortedCandidates) {
    console.log(`${file}: ${count}`);
  }
}

if (candidatesPerFileCount.size > 0 && process.argv.includes('--check')) {
  console.log('\n\nOne or more files contain CJS requires which could be written as ESM imports.');
  console.log(
    'Please convert them to ESM or add the module to the CJS_ONLY_MODULES set in tools/cjs-to-esm-candidates.mjs.',
  );
  process.exitCode = 1;
}
