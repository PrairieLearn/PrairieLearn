import { type Formatter, createFormatter } from '@reteps/tree-sitter-htmlmustache/formatter';
import {
  type Diagnostic,
  type Linter,
  createLinter,
} from '@reteps/tree-sitter-htmlmustache/linter';
import type ace from 'ace-builds';

import { htmlMustacheConfig } from '../../../src/lib/htmlMustacheConfig.js';

const GRAMMAR_WASM_FILENAME = 'tree-sitter-htmlmustache.wasm';
const RUNTIME_WASM_FILENAME = 'web-tree-sitter.wasm';

let linterPromise: Promise<Linter> | null = null;
let formatterPromise: Promise<Formatter> | null = null;

function locateWasm(name: string): string {
  const grammarWasm = document
    .querySelector('meta[name="htmlmustache-grammar-wasm"]')
    ?.getAttribute('content');
  const runtimeWasm = document
    .querySelector('meta[name="htmlmustache-runtime-wasm"]')
    ?.getAttribute('content');

  if (!grammarWasm || !runtimeWasm) {
    throw new Error('Missing htmlmustache wasm meta tags');
  }

  if (name === GRAMMAR_WASM_FILENAME) return grammarWasm;
  if (name === RUNTIME_WASM_FILENAME) return runtimeWasm;
  return name;
}

function getLinter(): Promise<Linter> {
  if (linterPromise) return linterPromise;

  linterPromise = createLinter({
    locateWasm,
  });
  return linterPromise;
}

function getFormatter(): Promise<Formatter> {
  if (formatterPromise) return formatterPromise;

  formatterPromise = createFormatter({
    locateWasm,
  });
  return formatterPromise;
}

function diagnosticsToAnnotations(diagnostics: Diagnostic[]): ace.Ace.Annotation[] {
  return diagnostics.map((d) => ({
    row: d.line - 1,
    column: d.column - 1,
    text: d.message,
    type: d.severity,
  }));
}

/**
 * Lints on every edit (debounced) and renders diagnostics as Ace annotations.
 * Wires up the Reformat button (if present) to format the editor contents.
 */
export function attachHtmlMustacheLinter({
  editor,
  reformatButton,
}: {
  editor: ace.Ace.Editor;
  reformatButton: HTMLButtonElement | null;
}): void {
  let debounceTimer: number | undefined;

  async function runLint() {
    try {
      const linter = await getLinter();
      const diagnostics = linter.lint(editor.getValue(), htmlMustacheConfig);
      editor.getSession().setAnnotations(diagnosticsToAnnotations(diagnostics));
    } catch (err) {
      console.error('htmlmustache lint failed', err);
    }
  }

  editor.getSession().on('change', () => {
    window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(runLint, 250);
  });
  void runLint();

  if (reformatButton) {
    window.bootstrap.Toast.getOrCreateInstance('#js-html-mustache-reformat-error', {
      delay: 5000,
    });
    reformatButton.addEventListener('click', async () => {
      try {
        const formatter = await getFormatter();
        const cursor = editor.getCursorPosition();
        const formatted = await formatter.format(editor.getValue(), htmlMustacheConfig);
        // Use setValue (not session.setValue) so the change is added to the undo stack.
        editor.setValue(formatted, -1);
        editor.moveCursorToPosition(cursor);
        editor.focus();
      } catch (err) {
        console.error('htmlmustache reformat failed', err);
        window.bootstrap.Toast.getOrCreateInstance('#js-html-mustache-reformat-error').show();
      }
    });
  }
}
