import { createRequire } from 'node:module';

import {
  type Diagnostic,
  type Linter,
  createLinter,
} from '@reteps/tree-sitter-htmlmustache/linter';

import { htmlMustacheConfig } from './htmlMustacheConfig.js';

export type QuestionHtmlDiagnostic = Pick<Diagnostic, 'message' | 'severity'>;

const require = createRequire(import.meta.url);
const wasmPath = require.resolve('@reteps/tree-sitter-htmlmustache/tree-sitter-htmlmustache.wasm');

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
export async function lintQuestionHtml(html: string): Promise<QuestionHtmlDiagnostic[]> {
  const linter = await getLinter();
  return linter.lint(html, htmlMustacheConfig).map((diagnostic) => ({
    message: diagnostic.message,
    severity: diagnostic.severity,
  }));
}
