// Codex ships its protocol generator in the native executable rather than a
// TypeScript library. Export definitions from the pinned CLI, then keep only
// types used by the app and validators. CI checks that regeneration agrees.
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import Ajv from 'ajv';
import standaloneCode from 'ajv/dist/standalone/index.js';
import { build } from 'esbuild';
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
  await execa(process.execPath, [
    cli,
    'app-server',
    'generate-json-schema',
    '--experimental',
    '--out',
    temporary,
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
  const schema = JSON.parse(
    await readFile(path.join(temporary, 'codex_app_server_protocol.schemas.json'), 'utf8'),
  );
  const catalog = JSON.parse(await readFile(path.join(root, 'protocol-methods.json'), 'utf8'));
  // Compile during generation: Workers cannot construct validators with runtime eval.
  const ajv = new Ajv({
    strict: false,
    inlineRefs: false,
    // These Rust format annotations add no JSON representation beyond the schema's numeric constraints.
    formats: { int64: true, int32: true, uint: true, uint16: true, uint32: true, uint64: true },
    code: { source: true, esm: true },
  });
  ajv.addSchema(schema, 'codex');
  const exports = {};
  const declarations = [];
  const requests = [];
  const serverRequests = [];
  const notifications = [];
  const addValidator = (name, ref, typePath) => {
    ajv.addSchema({ $id: name, $ref: `codex${ref}` });
    exports[name] = name;
    declarations.push(
      `import type { ${path.basename(typePath)} as ${name}Type } from './types/${typePath}.js';`,
      `export declare function ${name}(value: unknown): value is ${name}Type;`,
    );
  };
  const findMethod = (union, method) => {
    const entry = schema.definitions[union].oneOf.find(
      (entry) => entry.properties.method.enum[0] === method,
    );
    if (!entry) throw new Error(`Missing ${union} method: ${method}`);
    const ref = entry.properties.params.$ref;
    // Schema definition paths sometimes differ from TS paths; use the upstream import.
    const declaration = project
      .getSourceFileOrThrow(path.join(output, 'types', `${union}.ts`))
      .getImportDeclarations()
      .find((declaration) =>
        declaration.getNamedImports().some((named) => named.getName() === path.basename(ref)),
      );
    if (!declaration) throw new Error(`Missing ${union} parameter type: ${method}`);
    const typePath = declaration
      .getModuleSpecifierValue()
      .replace(/^\.\//, '')
      .replace(/\.js$/, '');
    return { ref, typePath };
  };
  for (const [index, [method, result]] of Object.entries(catalog.requests).entries()) {
    const params = findMethod('ClientRequest', method);
    const paramsName = `request${index}Params`;
    const resultName = `request${index}Result`;
    addValidator(paramsName, params.ref, params.typePath);
    addValidator(resultName, `#/definitions/${result}`, result);
    requests.push(
      `${JSON.stringify(method)}: { method: ${JSON.stringify(method)}, params: validators.${paramsName}, result: validators.${resultName} }`,
    );
  }
  for (const [index, [method, result]] of Object.entries(catalog.serverRequests).entries()) {
    const params = findMethod('ServerRequest', method);
    const paramsName = `serverRequest${index}Params`;
    const resultName = `serverRequest${index}Result`;
    addValidator(paramsName, params.ref, params.typePath);
    addValidator(resultName, `#/definitions/${path.basename(result)}`, result);
    serverRequests.push(
      `${JSON.stringify(method)}: { method: ${JSON.stringify(method)}, params: validators.${paramsName}, result: validators.${resultName} }`,
    );
  }
  for (const [index, method] of catalog.notifications.entries()) {
    const params = findMethod('ServerNotification', method);
    const name = `notification${index}`;
    addValidator(name, params.ref, params.typePath);
    notifications.push(
      `${JSON.stringify(method)}: { method: ${JSON.stringify(method)}, params: validators.${name} }`,
    );
  }
  const compiled = await build({
    stdin: { contents: standaloneCode.default(ajv, exports), resolveDir: root },
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    write: false,
  });
  const banner = '// GENERATED CODE! DO NOT MODIFY BY HAND!\n';
  await writeFile(path.join(output, 'validators.js'), banner + compiled.outputFiles[0].text);
  await writeFile(path.join(output, 'validators.d.ts'), banner + declarations.join('\n'));
  await writeFile(
    path.join(output, 'protocol.ts'),
    banner +
      "import * as validators from './validators.js';\n" +
      `export const requests = { ${requests.join(',\n')} } as const;\n` +
      `export const serverRequests = { ${serverRequests.join(',\n')} } as const;\n` +
      `export const notifications = { ${notifications.join(',\n')} } as const;\n`,
  );
  // Follow imports from app code and validator declarations, including transitive dependencies.
  const pending = [
    ...project.addSourceFilesAtPaths(path.join(root, 'src/**/*.{ts,tsx}')),
    project.addSourceFileAtPath(path.join(output, 'validators.d.ts')),
  ];
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
    await writeFile(
      file,
      await format(await readFile(file, 'utf8'), { ...options, filepath: file }),
    );
  }
} finally {
  await rm(temporary, { recursive: true, force: true });
}
