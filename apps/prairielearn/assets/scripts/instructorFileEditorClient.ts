import ace from 'ace-builds';
import prettierBabelPlugin from 'prettier/plugins/babel';
import prettierEstreePlugin from 'prettier/plugins/estree';
import * as prettier from 'prettier/standalone';

import { onDocumentReady } from '@prairielearn/browser-utils';

/**
 * Given an Ace cursor position (consisting of a row and column) and the lines
 * of the document, returns a cursor offset from the start of the document.
 */
function getCursorOffsetFromCursorPosition(position: ace.Ace.Point, lines: string[]): number {
  const cursorOffset = lines.slice(0, position.row).reduce((acc, line) => acc + line.length + 1, 0);
  return cursorOffset + position.column;
}

/**
 * Given a cursor offset from the start of the document and the lines of the
 * document, returns an Ace cursor position (consisting of a row and column).
 */
function getCursorPositionFromCursorOffset(cursorOffset: number, lines: string[]): ace.Ace.Point {
  let row = 0;
  let column = 0;
  let offset = 0;
  for (const line of lines) {
    if (offset + line.length >= cursorOffset) {
      column = cursorOffset - offset;
      break;
    }
    offset += line.length + 1;
    row += 1;
  }
  return { row, column };
}

class InstructorFileEditor {
  element: HTMLElement;
  diskContents?: string;
  saveElement?: HTMLButtonElement | null;
  inputContentsElement?: HTMLInputElement | null;
  editor: ace.Ace.Editor;

  constructor({
    element,
    saveElement,
    aceMode,
    readOnly,
    contents,
    diskContents,
  }: {
    element: HTMLElement;
    saveElement?: HTMLButtonElement | null;
    aceMode?: string;
    readOnly?: boolean;
    contents?: string;
    diskContents?: string;
  }) {
    this.element = element;
    const editorElement = element.querySelector<HTMLElement>('.editor');
    if (!editorElement) {
      throw new Error(`Could not find .editor element inside ${element.id}`);
    }

    this.saveElement = saveElement;
    this.inputContentsElement = element.querySelector('input[name=file_edit_contents]');
    this.editor = ace.edit(editorElement, {
      minLines: 10,
      maxLines: Infinity,
      autoScrollEditorIntoView: true,
      wrap: true,
      showPrintMargin: false,
      mode: aceMode || undefined,
      readOnly,
      enableKeyboardAccessibility: true,
      theme: 'ace/theme/chrome',
    });

    this.setEditorContents(contents ? this.b64DecodeUnicode(contents) : '');
    this.diskContents = diskContents ? this.b64DecodeUnicode(diskContents) : '';

    this.editor.commands.addCommand({
      name: 'saveAndSync',
      bindKey: { win: 'Ctrl-s', mac: 'Command-s' },
      exec: () => {
        this.saveElement?.click();
      },
    });

    this.editor.getSession().on('change', () => this.onChange());

    if (aceMode === 'ace/mode/json') {
      this.editor.getSession().setTabSize(2);
      $('#js-json-reformat-error').toast({ delay: 5000 });
      document
        .querySelector<HTMLButtonElement>('.js-reformat-file')
        ?.addEventListener('click', () => this.reformatJSONFile());
    }
  }

  setEditorContents(contents: string) {
    // use session.setValue to reset the undo stack as well
    this.editor.getSession().setValue(contents);
    this.editor.gotoLine(1, 0, false);
    this.editor.focus();
    this.syncFileToHiddenInput();
  }

  syncFileToHiddenInput() {
    if (this.inputContentsElement) {
      this.inputContentsElement.value = this.b64EncodeUnicode(this.editor.getValue());
    }
  }

  b64DecodeUnicode(str: string) {
    // Going backwards: from bytestream, to percent-encoding, to original string.
    return decodeURIComponent(
      atob(str)
        .split('')
        .map((c) => {
          return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        })
        .join(''),
    );
  }

  b64EncodeUnicode(str: string) {
    // first we use encodeURIComponent to get percent-encoded UTF-8,
    // then we convert the percent encodings into raw bytes which
    // can be fed into btoa.
    return btoa(
      encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_match, p1) => {
        return String.fromCharCode(Number(`0x${p1}`));
      }),
    );
  }

  onChange() {
    this.syncFileToHiddenInput();
    this.checkDiff();
  }

  checkDiff() {
    if (this.saveElement) {
      this.saveElement.disabled = this.editor.getValue() === this.diskContents;
    }
  }

  takeOver() {
    this.editor.setReadOnly(false);
    this.checkDiff();
    this.editor.resize();
  }

  async reformatJSONFile() {
    try {
      const { formatted, cursorOffset } = await prettier.formatWithCursor(this.editor.getValue(), {
        cursorOffset: getCursorOffsetFromCursorPosition(
          this.editor.getCursorPosition(),
          this.editor.getSession().getDocument().getAllLines(),
        ),
        parser: 'json',
        plugins: [prettierBabelPlugin, prettierEstreePlugin],
      });

      // We use this instead of `this.setEditorContents` so that this change
      // is added to the undo stack.
      this.editor.setValue(formatted, -1);
      this.editor.moveCursorToPosition(
        getCursorPositionFromCursorOffset(
          cursorOffset,
          this.editor.getSession().getDocument().getAllLines(),
        ),
      );
      this.editor.focus();
    } catch (err) {
      console.error(err);
      $('#js-json-reformat-error').toast('show');
    }
  }
}

onDocumentReady(() => {
  // ace loads modes/themes dynamically as needed, but its unable to identify
  // the base path implicitly when using compiled assets. We explicitly set the
  // base path for modes/themes here based on the meta tag set in the document,
  // which is computed server-side based on the asset path for the ace-builds
  // module.
  const aceBasePath = document.querySelector('meta[name="ace-base-path"]')?.getAttribute('content');
  ace.config.set('modePath', aceBasePath);
  ace.config.set('workerPath', aceBasePath);
  ace.config.set('themePath', aceBasePath);

  const draftEditorElement = document.querySelector<HTMLElement>('#file-editor-draft');
  const diskEditorElement = document.querySelector<HTMLElement>('#file-editor-disk');

  const draftEditor = draftEditorElement
    ? new InstructorFileEditor({
        element: draftEditorElement,
        aceMode: draftEditorElement.dataset.aceMode,
        readOnly: draftEditorElement.dataset.readOnly === 'true',
        contents: draftEditorElement.dataset.contents,
        // If the `#file-editor-disk` element exists, then the disk content is
        // actually based on that element, and the draft element contains the
        // last "unsuccessful" edit.
        diskContents: diskEditorElement?.dataset.contents ?? draftEditorElement.dataset.contents,
        saveElement: document.querySelector<HTMLButtonElement>('#file-editor-save-button'),
      })
    : null;

  if (diskEditorElement) {
    new InstructorFileEditor({
      element: diskEditorElement,
      aceMode: diskEditorElement.dataset.aceMode,
      readOnly: true,
      contents: diskEditorElement.dataset.contents,
    });
  }

  document
    .querySelector<HTMLButtonElement>('#choose-my-version-button')
    ?.addEventListener('click', () => {
      document
        .querySelectorAll('.js-version-choice-content')
        .forEach((element) => element.remove());

      // Show div that contains "Show help" and "Save and sync" buttons
      $('#buttons').collapse('show');

      draftEditor?.takeOver();
    });

  const showDetail = document.getElementById('job-sequence-results');
  const showDetailButton = document.getElementById('job-sequence-results-button');
  if (showDetail && showDetailButton) {
    $(showDetail)
      .on('hide.bs.collapse', () => {
        showDetailButton.textContent = 'Show detail';
      })
      .on('show.bs.collapse', () => {
        showDetailButton.textContent = 'Hide detail';
      });
  }

  const helpBox = document.getElementById('help');
  const helpButton = document.getElementById('help-button');
  const helpButtonLabel = document.getElementById('help-button-label');
  if (helpBox && helpButton && helpButtonLabel) {
    $(helpBox)
      .on('hide.bs.collapse', () => {
        helpButtonLabel.textContent = 'Show help';
        helpButton.ariaExpanded = 'false';
      })
      .on('show.bs.collapse', () => {
        helpButtonLabel.textContent = 'Hide help';
        helpButton.ariaExpanded = 'true';
      });
  }
});
