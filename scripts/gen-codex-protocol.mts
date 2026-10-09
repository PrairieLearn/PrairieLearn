#!/usr/bin/env node

// Keep Codex's directory structure and comments. Selecting concrete payload types
// avoids importing the entire experimental protocol and flattening colliding names.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import prettier from 'prettier';
import ts from 'typescript';

const check = process.argv[2] === 'check';
const root = path.resolve(import.meta.dirname, '..');
const app = path.join(root, 'apps/course-agent');
const target = path.join(app, 'src/generated');
const pkg = JSON.parse(await fs.readFile(path.join(app, 'package.json'), 'utf8'));
const version: string = pkg.devDependencies['@openai/codex'];
const binary = process.env.CODEX_BINARY ?? path.join(app, 'node_modules/.bin/codex');
if (
  (await fs.readFile(path.join(app, 'Dockerfile'), 'utf8')).includes(`@openai/codex@${version}`) ===
  false
) {
  throw new Error('Dockerfile and the protocol generator must use the same pinned Codex version.');
}
const actual = execFileSync(binary, ['--version'], { encoding: 'utf8' }).trim();
if (actual !== `codex-cli ${version}`) throw new Error(`Expected Codex ${version}; got ${actual}.`);

const output = await fs.mkdtemp(path.join(tmpdir(), 'codex-protocol-'));
try {
  execFileSync(binary, ['app-server', 'generate-ts', '--experimental', '--out', output]);
  const generated = new Map<string, string>();

  async function visit(file: string): Promise<void> {
    if (generated.has(file)) return;
    const source = await fs.readFile(path.join(output, file), 'utf8');
    const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    const dependencies: string[] = [];
    const replacements: { start: number; end: number; text: string }[] = [];
    for (const statement of parsed.statements) {
      if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
        continue;
      }
      const specifier = statement.moduleSpecifier;
      if (!specifier.text.startsWith('.')) {
        throw new Error(`Unexpected protocol import: ${specifier.text}`);
      }
      const dependency = path.posix.normalize(
        path.posix.join(path.posix.dirname(file), `${specifier.text}.ts`),
      );
      if (dependency.startsWith('../')) {
        throw new Error(`Protocol dependency escapes output: ${dependency}`);
      }
      dependencies.push(dependency);
      // NodeNext requires .js specifiers, including in type-only imports.
      replacements.push({
        start: specifier.getStart(parsed),
        end: specifier.end,
        text: JSON.stringify(`${specifier.text}.js`),
      });
    }
    let rewritten = source;
    for (const replacement of replacements.reverse()) {
      rewritten =
        rewritten.slice(0, replacement.start) + replacement.text + rewritten.slice(replacement.end);
    }
    const filepath = path.join(target, file);
    const formatted = await prettier.format(
      `// Generated from Codex ${version} (Apache-2.0). Regenerate: make update-codex-protocol.\n${rewritten}`,
      { ...(await prettier.resolveConfig(filepath)), filepath },
    );
    generated.set(file, formatted);
    await Promise.all(dependencies.map(visit));
  }
  for (const name of [
    'InitializeParams',
    'InitializeResponse',
    'v2/ThreadStartParams',
    'v2/ThreadStartResponse',
    'v2/ThreadResumeParams',
    'v2/ThreadResumeResponse',
    'v2/ThreadReadParams',
    'v2/ThreadReadResponse',
    'v2/TurnStartParams',
    'v2/TurnStartResponse',
    'v2/TurnSteerParams',
    'v2/TurnSteerResponse',
    'v2/TurnInterruptParams',
    'v2/TurnInterruptResponse',
    'v2/DynamicToolCallParams',
    'v2/DynamicToolCallResponse',
    'v2/ThreadTokenUsageUpdatedNotification',
    'v2/TurnStartedNotification',
    'v2/TurnCompletedNotification',
    'v2/ItemStartedNotification',
    'v2/ItemCompletedNotification',
    'v2/AgentMessageDeltaNotification',
    'v2/ReasoningSummaryTextDeltaNotification',
  ]) {
    await visit(`${name}.ts`);
  }

  const existing = await fs
    .readdir(target, { recursive: true })
    .catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return [];
      throw error;
    });
  const stale = existing.filter((file) => file.endsWith('.ts') && !generated.has(file));
  const differences: string[] = [...stale];
  for (const [file, source] of generated) {
    const destination = path.join(target, file);
    if (check) {
      if ((await fs.readFile(destination, 'utf8').catch(() => undefined)) !== source) {
        differences.push(file);
      }
    } else {
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.writeFile(destination, source);
    }
  }
  if (check && differences.length > 0) {
    throw new Error(
      `Stale Codex protocol files:\n${differences.join('\n')}\nRun make update-codex-protocol.`,
    );
  }
  if (!check) await Promise.all(stale.map((file) => fs.rm(path.join(target, file))));
} finally {
  await fs.rm(output, { recursive: true, force: true });
}
