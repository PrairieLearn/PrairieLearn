import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { execa } from 'execa';
import { format, resolveConfig } from 'prettier';
import { Project } from 'ts-morph';

const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'generated');
const temporary = await mkdtemp(path.join(tmpdir(), 'course-agent-protocol-'));
try {
  const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const cli = path.join(root, 'node_modules/@openai/codex/bin/codex.js');
  const version = await execa(process.execPath, [cli, '--version']);
  if (version.stdout !== `codex-cli ${manifest.devDependencies['@openai/codex']}`)
    {throw new Error('Codex generator version does not match the pinned runtime');}
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  await execa(process.execPath, [
    cli,
    'app-server',
    'generate-ts',
    '--out',
    path.join(output, 'types'),
  ]);
  await execa(process.execPath, [cli, 'app-server', 'generate-json-schema', '--out', temporary]);
  // The CLI's aggregate schema already includes the individual schema files.
  await writeFile(
    path.join(output, 'protocol.schema.json'),
    await readFile(path.join(temporary, 'codex_app_server_protocol.schemas.json')),
  );
  const project = new Project({ skipAddingFilesFromTsConfig: true });
  for (const source of project.addSourceFilesAtPaths(path.join(output, 'types/**/*.ts'))) {
    for (const declaration of [
      ...source.getImportDeclarations(),
      ...source.getExportDeclarations(),
    ]) {
      const specifier = declaration.getModuleSpecifierValue();
      if (specifier?.startsWith('.')) declaration.setModuleSpecifier(`${specifier}.js`);
    }
    await source.save();
  }
  const options = await resolveConfig(root);
  for (const entry of await readdir(output, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const file = path.join(entry.parentPath, entry.name);
    await writeFile(
      file,
      await format(await readFile(file, 'utf8'), { ...options, filepath: file }),
    );
  }
} finally {
  await rm(temporary, { recursive: true, force: true });
}
