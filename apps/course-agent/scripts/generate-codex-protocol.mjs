// Codex ships its protocol generator in the native executable rather than a
// TypeScript library. Keep only types imported by the app and their dependencies.
// CI checks that regeneration agrees with the pinned runtime.
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { execa } from 'execa';
import { format, resolveConfig } from 'prettier';
import { Project } from 'ts-morph';

const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'generated');
const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const cli = path.join(root, 'node_modules/@openai/codex/bin/codex.js');
const version = await execa(process.execPath, [cli, '--version']);
if (version.stdout !== `codex-cli ${manifest.devDependencies['@openai/codex']}`) {
  throw new Error('Codex generator version does not match the pinned runtime');
}
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await execa(process.execPath, [
  cli,
  'app-server',
  'generate-ts',
  '--experimental',
  '--out',
  path.join(output, 'types'),
]);
const project = new Project({ skipAddingFilesFromTsConfig: true });
const types = project.addSourceFilesAtPaths(path.join(output, 'types/**/*.ts'));
for (const source of types) {
  for (const declaration of [
    ...source.getImportDeclarations(),
    ...source.getExportDeclarations(),
  ]) {
    const specifier = declaration.getModuleSpecifierValue();
    if (specifier?.startsWith('.')) declaration.setModuleSpecifier(`${specifier}.js`);
  }
  await source.save();
}
// Follow app imports transitively without retaining unrelated protocol definitions.
const pending = project.addSourceFilesAtPaths(path.join(root, 'src/**/*.{ts,tsx}'));
const reachable = new Set();
while (pending.length > 0) {
  const source = pending.pop();
  if (reachable.has(source)) continue;
  reachable.add(source);
  pending.push(
    ...source
      .getReferencedSourceFiles()
      .filter((dependency) => dependency.getFilePath().startsWith(`${output}/types/`)),
  );
}
for (const source of types) {
  if (!reachable.has(source)) await rm(source.getFilePath());
}
const options = await resolveConfig(root);
for (const entry of await readdir(output, { recursive: true, withFileTypes: true })) {
  if (!entry.isFile()) continue;
  const file = path.join(entry.parentPath, entry.name);
  await writeFile(file, await format(await readFile(file, 'utf8'), { ...options, filepath: file }));
}
