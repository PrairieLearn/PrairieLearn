// Formats generated file contents exactly like `oxfmt` would format the file on disk.
// oxfmt's `format()` API doesn't discover `.oxfmtrc.json` or apply its `overrides`, so
// this pipes the contents through the CLI instead.

import { spawnSync } from 'node:child_process';
import path from 'node:path';

const OXFMT_BIN = path.join(import.meta.dirname, '..', 'node_modules', '.bin', 'oxfmt');

export function formatWithOxfmt(filePath: string, contents: string): string {
  const result = spawnSync(OXFMT_BIN, ['--stdin-filepath', filePath], {
    encoding: 'utf8',
    input: contents,
  });
  if (result.status !== 0) {
    throw new Error(`Failed to format ${filePath}:\n${result.stderr}`);
  }
  return result.stdout;
}
