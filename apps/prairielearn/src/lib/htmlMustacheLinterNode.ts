import { createRequire } from 'node:module';

import {
  type Diagnostic,
  type Linter,
  createLinter,
} from '@reteps/tree-sitter-htmlmustache/linter';

import { formats, validators } from './element-schemas/htmlmustache-plugin.js';
import { htmlMustacheConfig } from './htmlMustacheConfig.js';


const require = createRequire(import.meta.url);

const GRAMMAR_WASM_FILENAME = 'tree-sitter-htmlmustache.wasm';
const RUNTIME_WASM_FILENAME = 'web-tree-sitter.wasm';

let linterPromise: Promise<Linter> | null = null;

function getLinter(): Promise<Linter> {
  linterPromise ??= createLinter({
    locateWasm: (name) => {
      if (name === GRAMMAR_WASM_FILENAME) {
        return require.resolve('@reteps/tree-sitter-htmlmustache/tree-sitter-htmlmustache.wasm');
      }
      if (name === RUNTIME_WASM_FILENAME) {
        return require.resolve('web-tree-sitter/web-tree-sitter.wasm');
      }
      return name;
    },
    formats,
    validators,
  });

  return linterPromise;
}

export async function lintQuestionHtml(file: string): Promise<Diagnostic[]> {
  const linter = await getLinter();
  return linter.lint(file, htmlMustacheConfig);
}
