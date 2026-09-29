import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const output = mkdtempSync(join(tmpdir(), 'codex-protocol-'));
const binary = process.env.CODEX_BINARY;
if (!binary) throw new Error('Set CODEX_BINARY to the pinned Codex 0.155.0 executable.');
const prefix = [];
try {
  const version = execFileSync(binary, [...prefix, '--version'], {
    encoding: 'utf8',
  }).trim();
  if (version !== 'codex-cli 0.155.0') throw new Error(`Expected Codex 0.155.0, got ${version}`);
  execFileSync(binary, [...prefix, 'app-server', 'generate-ts', '--experimental', '--out', output]);
  const files = new Set();
  const definitions = [];

  function visit(file, methods) {
    if (files.has(file)) return;
    files.add(file);
    let source = readFileSync(file, 'utf8');
    if (methods) {
      // The pinned generator emits flat method variants whose payloads are named types.
      const variants = [...source.matchAll(/\{ "method": "([^"]+)",[^{}]*\}/g)].filter((match) =>
        methods.includes(match[1]),
      );
      if (variants.length !== methods.length) {
        throw new Error(`Unexpected generated method union in ${file}`);
      }
      const body = variants.map((match) => match[0]).join(' | ');
      const imports = [...source.matchAll(/^import type \{ (\w+) \} from ".+?";$/gm)]
        .filter((match) => new RegExp(`\\b${match[1]}\\b`).test(body))
        .map((match) => match[0]);
      const name = source.match(/export type (\w+)\s*=/)[1];
      source = imports.join('\n') + `\nexport type ${name} = ${body};\n`;
    }
    // The generator has distinct root and v2 types with this name; preserve that distinction when flattening.
    if (
      file === join(output, 'WebSearchAction.ts') ||
      [...source.matchAll(/import type .*? from "(.+?)";/g)].some(
        (match) => resolve(dirname(file), match[1] + '.ts') === join(output, 'WebSearchAction.ts'),
      )
    ) {
      source = source.replaceAll(/\bWebSearchAction\b/g, 'LegacyWebSearchAction');
    }
    source = source.replaceAll(/^import type .*? from "(.+?)";\n/gm, (_, path) => {
      visit(
        resolve(dirname(file), path.replace('LegacyWebSearchAction', 'WebSearchAction') + '.ts'),
      );
      return '';
    });
    definitions.push(source.replaceAll(/^\/\/.*\n/gm, '').trim());
  }
  visit(join(output, 'ClientRequest.ts'), [
    'initialize',
    'thread/start',
    'thread/resume',
    'thread/read',
    'turn/start',
    'turn/steer',
    'turn/interrupt',
  ]);
  visit(join(output, 'ServerNotification.ts'), [
    'thread/tokenUsage/updated',
    'turn/started',
    'turn/completed',
    'item/started',
    'item/completed',
    'item/agentMessage/delta',
    'item/reasoning/summaryTextDelta',
    'item/reasoning/summaryPartAdded',
  ]);
  visit(join(output, 'ServerRequest.ts'), ['item/tool/call']);
  for (const name of [
    'v2/DynamicToolCallResponse',
    'InitializeResponse',
    'v2/ThreadStartResponse',
    'v2/ThreadResumeResponse',
    'v2/ThreadReadResponse',
    'v2/TurnStartResponse',
    'v2/TurnSteerResponse',
    'v2/TurnInterruptResponse',
  ]) {
    visit(join(output, name + '.ts'));
  }
  const target = new URL('../src/protocol.ts', import.meta.url);
  writeFileSync(
    target,
    '// Generated from Codex 0.155.0 (Apache-2.0). Do not edit.\n// Regenerate with pnpm --filter @prairielearn/course-agent generate:protocol.\n\n' +
      definitions.join('\n\n') +
      '\n',
  );
  execFileSync(process.execPath, [
    new URL('../../../node_modules/prettier/bin/prettier.cjs', import.meta.url).pathname,
    '--write',
    target.pathname,
  ]);
} finally {
  rmSync(output, { recursive: true, force: true });
}
