import ace from 'ace-builds';
import prettierBabelPlugin from 'prettier/plugins/babel';
import prettierEstreePlugin from 'prettier/plugins/estree';
import * as prettier from 'prettier/standalone';

import { onDocumentReady } from '@prairielearn/browser-utils';

import {
  type FileMetadata,
  FileType,
  friendlyNameForFileType,
} from '../../src/lib/editorUtil.types.js';

import { configureAceBasePaths } from './lib/ace.js';
import './lib/verboseToggle.js';

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
  fileMetadata?: FileMetadata;
  aceMode?: string;
  private confirmedSave = false;

  constructor({
    element,
    saveElement,
    aceMode,
    readOnly = false,
    contents,
    diskContents,
    fileMetadata,
  }: {
    element: HTMLElement;
    saveElement?: HTMLButtonElement | null;
    aceMode?: string;
    readOnly?: boolean;
    contents?: string;
    diskContents?: string;
    fileMetadata?: FileMetadata;
  }) {
    this.element = element;
    const editorElement = element.querySelector<HTMLElement>('.editor');
    if (!editorElement) {
      throw new Error(`Could not find .editor element inside ${element.id}`);
    }

    this.saveElement = saveElement;
    this.inputContentsElement = element.querySelector('input[name=file_edit_contents]');
    this.fileMetadata = fileMetadata;
    this.aceMode = aceMode;
    this.editor = ace.edit(editorElement, {
      minLines: 10,
      maxLines: Infinity,
      autoScrollEditorIntoView: true,
      wrap: true,
      showPrintMargin: false,
      mode: aceMode ?? 'ace/mode/text',
      readOnly,
      enableKeyboardAccessibility: true,
      theme: 'ace/theme/chrome',
    } satisfies Partial<ace.Ace.EditorOptions>);

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
      window.bootstrap.Toast.getOrCreateInstance('#js-json-reformat-error', { delay: 5000 });
      document
        .querySelector<HTMLButtonElement>('.js-reformat-file')
        ?.addEventListener('click', () => this.reformatJSONFile());
    }

    // Override the save button click to show confirmation modal if needed
    this.saveElement!.addEventListener('click', (e) => this.handleSaveClick(e));
  }

  /**
   * Handles the save button click, showing a confirmation modal if there are issues,
   * or proceeding with the save if the user has already confirmed.
   */
  handleSaveClick(event: MouseEvent) {
    if (this.confirmedSave) {
      this.confirmedSave = false;
      return;
    }

    const issues = this.checkForSaveIssues();

    if (issues.length > 0) {
      event.preventDefault();
      this.showConfirmationModal(issues);
    }

    // Otherwise, continue with the save
  }

  /**
   * Checks for issues that would require confirmation before saving.
   *
   * @returns An array of issues that would require confirmation before saving.
   */
  checkForSaveIssues(): string[] {
    const issues: string[] = [];
    const currentContents = this.editor.getValue();

    if (this.fileMetadata && this.fileMetadata.type !== FileType.File) {
      try {
        const parsedContent = JSON.parse(currentContents);

        if (this.fileMetadata.uuid) {
          if ('uuid' in parsedContent) {
            if (parsedContent.uuid !== this.fileMetadata.uuid) {
              issues.push(
                `The UUID in this ${friendlyNameForFileType(this.fileMetadata.type).toLowerCase()} file should match "${this.fileMetadata.uuid}".`,
              );
            }
          } else {
            issues.push(
              `This ${friendlyNameForFileType(this.fileMetadata.type).toLowerCase()} file should contain a UUID.`,
            );
          }
        }
      } catch {
        issues.push(
          `The ${friendlyNameForFileType(this.fileMetadata.type).toLowerCase()} metadata cannot be parsed as JSON.`,
        );
      }
    }

    return issues;
  }

  /**
   * Shows a confirmation modal with the given issues.
   *
   * @param issues - The issues to display in the modal.
   */
  showConfirmationModal(issues: string[]) {
    const issuesList = document.getElementById('save-confirmation-issues');
    issuesList!.innerHTML = issues.map((issue) => `<li>${issue}</li>`).join('');

    const modalElement = document.getElementById('save-confirmation-modal')!;

    const modal = window.bootstrap.Modal.getOrCreateInstance(modalElement);
    modal.show();

    const confirmButton = modalElement.querySelector('#confirm-save-button');

    confirmButton!.addEventListener('click', () => {
      modal.hide();
      this.confirmedSave = true;
      this.saveElement!.click();
    });
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
      encodeURIComponent(str).replaceAll(/%([0-9A-F]{2})/g, (_match, p1) => {
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
      window.bootstrap.Toast.getOrCreateInstance('#js-json-reformat-error').show();
    }
  }
}

onDocumentReady(() => {
  configureAceBasePaths();

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
        fileMetadata: draftEditorElement.dataset.fileMetadata
          ? JSON.parse(draftEditorElement.dataset.fileMetadata)
          : undefined,
      })
    : null;

  if (diskEditorElement) {
    new InstructorFileEditor({
      element: diskEditorElement,
      aceMode: diskEditorElement.dataset.aceMode,
      readOnly: true,
      contents: diskEditorElement.dataset.contents,
      fileMetadata: diskEditorElement.dataset.fileMetadata
        ? JSON.parse(diskEditorElement.dataset.fileMetadata)
        : undefined,
    });
  }

  document
    .querySelector<HTMLButtonElement>('#choose-my-version-button')
    ?.addEventListener('click', () => {
      document
        .querySelectorAll('.js-version-choice-content')
        .forEach((element) => element.remove());

      // Show div that contains "Show help" and "Save and sync" buttons
      window.bootstrap.Collapse.getOrCreateInstance('#buttons').show();

      draftEditor?.takeOver();
    });

  const showDetail = document.getElementById('job-sequence-results');
  const showDetailButton = document.getElementById('job-sequence-results-button');
  if (showDetail && showDetailButton) {
    showDetail.addEventListener('hide.bs.collapse', () => {
      showDetailButton.textContent = 'Show detail';
      showDetailButton.ariaExpanded = 'false';
    });
    showDetail.addEventListener('show.bs.collapse', () => {
      showDetailButton.textContent = 'Hide detail';
      showDetailButton.ariaExpanded = 'true';
    });
  }

  const helpBox = document.getElementById('help');
  const helpButton = document.getElementById('help-button');
  const helpButtonLabel = document.getElementById('help-button-label');
  if (helpBox && helpButton && helpButtonLabel) {
    helpBox.addEventListener('hide.bs.collapse', () => {
      helpButtonLabel.textContent = 'Show help';
      helpButton.ariaExpanded = 'false';
    });
    helpBox.addEventListener('show.bs.collapse', () => {
      helpButtonLabel.textContent = 'Hide help';
      helpButton.ariaExpanded = 'true';
    });
  }
});
