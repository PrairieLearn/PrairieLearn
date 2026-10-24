// Codex ships its protocol generator in the native executable rather than a
// TypeScript library. Export definitions from the pinned CLI, then adapt its
// imports and formatting for this repository. CI checks that regeneration agrees.
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
  const schema = JSON.parse(await readFile(path.join(output, 'protocol.schema.json'), 'utf8'));
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
  const declarations = [
    "import type { ClientRequest } from './types/ClientRequest.js';",
    "import type { ServerRequest } from './types/ServerRequest.js';",
    "import type { ServerNotification } from './types/ServerNotification.js';",
  ];
  const requests = [];
  const serverRequests = [];
  const notifications = [];
  const addValidator = (name, ref, type) => {
    ajv.addSchema({ $id: name, $ref: `codex${ref}` });
    exports[name] = name;
    declarations.push(`export declare function ${name}(value: unknown): value is ${type};`);
  };
  const findMethod = (union, method) => {
    const entry = schema.definitions[union].oneOf.find(
      (entry) => entry.properties.method.enum[0] === method,
    );
    if (!entry) throw new Error(`Missing ${union} method: ${method}`);
    return entry;
  };
  for (const [index, [method, result]] of Object.entries(catalog.requests).entries()) {
    const entry = findMethod('ClientRequest', method);
    const paramsName = `request${index}Params`;
    const resultName = `request${index}Result`;
    const resultType = `Result${index}`;
    declarations.push(
      `import type { ${path.basename(result)} as ${resultType} } from './types/${result}.js';`,
    );
    addValidator(
      paramsName,
      entry.properties.params.$ref,
      `Extract<ClientRequest, { method: ${JSON.stringify(method)} }>['params']`,
    );
    addValidator(resultName, `#/definitions/${result}`, resultType);
    requests.push(
      `${JSON.stringify(method)}: { method: ${JSON.stringify(method)}, params: validators.${paramsName}, result: validators.${resultName} }`,
    );
  }
  for (const [index, [method, result]] of Object.entries(catalog.serverRequests).entries()) {
    const entry = findMethod('ServerRequest', method);
    const paramsName = `serverRequest${index}Params`;
    const resultName = `serverRequest${index}Result`;
    const resultType = `ServerResult${index}`;
    declarations.push(
      `import type { ${path.basename(result)} as ${resultType} } from './types/${result}.js';`,
    );
    addValidator(
      paramsName,
      entry.properties.params.$ref,
      `Extract<ServerRequest, { method: ${JSON.stringify(method)} }>['params']`,
    );
    addValidator(resultName, `#/definitions/${path.basename(result)}`, resultType);
    serverRequests.push(
      `${JSON.stringify(method)}: { method: ${JSON.stringify(method)}, params: validators.${paramsName}, result: validators.${resultName} }`,
    );
  }
  for (const [index, method] of catalog.notifications.entries()) {
    const entry = findMethod('ServerNotification', method);
    const name = `notification${index}`;
    addValidator(
      name,
      entry.properties.params.$ref,
      `Extract<ServerNotification, { method: ${JSON.stringify(method)} }>['params']`,
    );
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
