// @ts-check
import { js, ts } from '@ast-grep/napi';
import * as fs from 'node:fs/promises';
import globby from 'globby';

const files = await globby(['apps/*/src/**/*.{js,ts}', 'packages/*/src/**/*.{js,ts}']);

async function parseFile(path) {
  const contents = await fs.readFile(path, 'utf-8');
  if (path.endsWith('.ts')) {
    return ts.parse(contents);
  }

  return js.parse(contents);
}

for (const file of files.sort()) {
  const ast = await parseFile(file);
  const root = ast.root();

  // Rewrite all local imports to include the `.js` extension.
  const nodes = root.findAll("import $IMPORT from '$PATH'");
  console.log(file, nodes);
  nodes.forEach((node) => {
    const path = node.getMatch('PATH');
    console.log(path?.text());
  });
}
