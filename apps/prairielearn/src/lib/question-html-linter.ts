import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import {
  type Config,
  type Diagnostic,
  type Linter,
  createLinter,
} from '@reteps/tree-sitter-htmlmustache/browser';

import { REPOSITORY_ROOT_PATH } from './paths.js';

const require = createRequire(import.meta.url);
const wasmPath = require.resolve('@reteps/tree-sitter-htmlmustache/tree-sitter-htmlmustache.wasm');

let lintConfig: Config | null = null;

function getLintConfig(): Config {
  if (lintConfig) return lintConfig;
  const raw = readFileSync(path.join(REPOSITORY_ROOT_PATH, '.htmlmustache.jsonc'), 'utf-8');
  // Strip // line-comments that aren't inside quoted strings.
  const stripped = raw.replaceAll(/("(?:[^"\\]|\\.)*")|\/\/.*/g, (match, quoted) => quoted ?? '');
  const parsed = JSON.parse(stripped) as Record<string, unknown>;
  lintConfig = {
    rules: parsed.rules as Config['rules'],
    customRules: (parsed.customRules as Record<string, unknown>[]).map(
      ({ include: _include, exclude: _exclude, ...rule }) => rule,
    ) as Config['customRules'],
    customTags: parsed.customTags as Config['customTags'],
  };
  return lintConfig;
}

let linterPromise: Promise<Linter> | null = null;

function getLinter(): Promise<Linter> {
  if (linterPromise) return linterPromise;
  linterPromise = createLinter({ locateWasm: wasmPath });
  return linterPromise;
}

/**
 * Lint a question.html string against the project's htmlmustache rules.
 * Returns diagnostics as `{ message, severity }` pairs.
 */
export async function lintQuestionHtml(
  html: string,
): Promise<Pick<Diagnostic, 'message' | 'severity'>[]> {
  const linter = await getLinter();
  return linter.lint(html, getLintConfig());
}
