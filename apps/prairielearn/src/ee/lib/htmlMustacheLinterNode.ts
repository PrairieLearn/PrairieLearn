import { createRequire } from 'node:module';

import {
  type Diagnostic,
  type Linter,
  createLinter,
} from '@reteps/tree-sitter-htmlmustache/linter';

import { htmlMustacheConfig } from '../../lib/htmlMustacheConfig.js';

import { formats } from './element-schemas/htmlmustache-plugin-utils.js';
import { validators as plMultipleChoiceValidators } from './element-schemas/pl-multiple-choice.validator.js';
import {
  blockGroupValidators as plOrderBlocksBlockGroupValidators,
  validators as plOrderBlocksValidators,
} from './element-schemas/pl-order-blocks.validator.js';

const require = createRequire(import.meta.url);

const GRAMMAR_WASM_FILENAME = 'tree-sitter-htmlmustache.wasm';
const RUNTIME_WASM_FILENAME = 'web-tree-sitter.wasm';
const validators = [
  ...plMultipleChoiceValidators,
  ...plOrderBlocksValidators,
  ...plOrderBlocksBlockGroupValidators,
];

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
