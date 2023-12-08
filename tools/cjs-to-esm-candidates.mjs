// @ts-check
import fs from 'node:fs/promises';
import globby from 'globby';
import { parse } from '@typescript-eslint/parser';

const files = await globby(['apps/*/src/**/*.{js,ts}']);

console.log(files);

const CJS_ONLY_MODULES = new Set([
  'async-stacktrace',
  'execa',
  'express-async-handler',
  'lodash',
  'request',
  'winston',
  'winston-transport',
]);

function maybeLogLocation(path, node, modulePath) {
  if (CJS_ONLY_MODULES.has(modulePath)) return;

  console.log(`${path}:${node.loc.start.line}:${node.loc.start.column}: ${modulePath}`);
}

for (const file of files.sort()) {
  const contents = await fs.readFile(file, 'utf-8');
  const ast = parse(contents, {
    range: true,
    loc: true,
    tokens: false,
  });

  ast.body.forEach((node) => {
    // Handle `require()` calls.
    if (node.type === 'VariableDeclaration') {
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
