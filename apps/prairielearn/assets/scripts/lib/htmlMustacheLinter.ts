import {
  type Diagnostic,
  type Linter,
  createLinter,
} from '@reteps/tree-sitter-htmlmustache/browser';
import type ace from 'ace-builds';

import { htmlMustacheConfig } from './htmlMustacheConfig.js';

const GRAMMAR_WASM_FILENAME = 'tree-sitter-htmlmustache.wasm';
const RUNTIME_WASM_FILENAME = 'web-tree-sitter.wasm';

let linterPromise: Promise<Linter> | null = null;

function getLinter(): Promise<Linter> {
  if (linterPromise) return linterPromise;

  const grammarWasm = document
    .querySelector('meta[name="htmlmustache-grammar-wasm"]')
    ?.getAttribute('content');
  const runtimeWasm = document
    .querySelector('meta[name="htmlmustache-runtime-wasm"]')
    ?.getAttribute('content');

  if (!grammarWasm || !runtimeWasm) {
    return Promise.reject(new Error('Missing htmlmustache wasm meta tags'));
  }

  linterPromise = createLinter({
    locateWasm: (name) => {
      if (name === GRAMMAR_WASM_FILENAME) return grammarWasm;
      if (name === RUNTIME_WASM_FILENAME) return runtimeWasm;
      return name;
    },
  });
  return linterPromise;
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
 * Wires up the Beautify button (if present) to format the editor contents.
 */
export function attachHtmlMustacheLinter({
  editor,
  beautifyButton,
}: {
  editor: ace.Ace.Editor;
  beautifyButton: HTMLButtonElement | null;
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

  if (beautifyButton) {
    window.bootstrap.Toast.getOrCreateInstance('#js-html-mustache-beautify-error', {
      delay: 5000,
    });
    beautifyButton.addEventListener('click', async () => {
      try {
        const linter = await getLinter();
        const cursor = editor.getCursorPosition();
        const formatted = await linter.format(editor.getValue(), htmlMustacheConfig);
        // Use setValue (not session.setValue) so the change is added to the undo stack.
        editor.setValue(formatted, -1);
        editor.moveCursorToPosition(cursor);
        editor.focus();
      } catch (err) {
        console.error('htmlmustache beautify failed', err);
        window.bootstrap.Toast.getOrCreateInstance('#js-html-mustache-beautify-error').show();
      }
    });
  }
}
