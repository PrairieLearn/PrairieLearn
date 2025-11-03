import ace from 'ace-builds';
import prettierBabelPlugin from 'prettier/plugins/babel';
import prettierEstreePlugin from 'prettier/plugins/estree';
import * as prettier from 'prettier/standalone';

import { onDocumentReady } from '@prairielearn/browser-utils';
import { renderHtml } from '@prairielearn/preact';

import { b64DecodeUnicode, b64EncodeUnicode } from '../../src/lib/base64-util.js';
import { type FileMetadata, FileType } from '../../src/lib/editorUtil.types.js';

import { configureAceBasePaths } from './lib/ace.js';
import './lib/verboseToggle.js';

/**
 * Error codes for save validation issues.
 */
enum SaveErrorCode {
  INVALID_JSON = 'INVALID_JSON',
  UUID_CHANGED = 'UUID_CHANGED',
  UUID_REMOVED = 'UUID_REMOVED',
}

/**
 * Modal content component for invalid JSON error.
 */
function InvalidJsonModalContent() {
  return (
    <div class="alert alert-danger d-flex flex-column align-items-start mb-0">
      <div class="d-flex flex-row align-items-start gap-2 mb-1">
        <i class="bi bi-x-circle-fill fs-6" />
        <strong>Invalid JSON</strong>
      </div>
      <div>
        This file contains invalid JSON syntax and cannot be saved. Please fix the errors before
        saving.
      </div>
    </div>
  );
}

/**
 * Modal content component for UUID change warning.
 */
function UuidChangeModalContent({
  errorCode,
  originalUuid,
  newUuid,
}: {
  errorCode: SaveErrorCode.UUID_CHANGED | SaveErrorCode.UUID_REMOVED;
  originalUuid?: string;
  newUuid?: string;
}) {
  const getMessage = () => {
    if (errorCode === SaveErrorCode.UUID_CHANGED && originalUuid && newUuid) {
      return (
        <>
          The UUID in this file was changed from <code>"{originalUuid}"</code> to{' '}
          <code>"{newUuid}"</code>.
        </>
      );
    } else if (errorCode === SaveErrorCode.UUID_REMOVED) {
      return <>The UUID was removed from this file.</>;
    }
    return <>The UUID was modified.</>;
  };

  return (
    <>
      <div class="alert alert-warning d-flex flex-column mb-3">
        <div class="d-flex flex-row align-items-start gap-2 mb-1">
          <i class="bi bi-exclamation-triangle-fill fs-6" />
          <strong>UUID Change</strong>
        </div>
        <div>{getMessage()}</div>
      </div>
      <div class="ms-0">Hitting "Confirm Save" will save this file with its original UUID.</div>
    </>
  );
}

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

    this.setEditorContents(contents ? b64DecodeUnicode(contents) : '');
    this.diskContents = diskContents ? b64DecodeUnicode(diskContents) : '';

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
    this.saveElement?.addEventListener('click', (e) => this.handleSaveClick(e));
  }

  /**
   * Handles the save button click, showing a confirmation modal if there are issues,
   * or proceeding with the save if the user has already confirmed.
   */
  handleSaveClick(event: MouseEvent) {
    if (this.confirmedSave) {
      // User has confirmed the save, so we need to restore the original UUID
      this.restoreOriginalUuid();
      this.confirmedSave = false;
      return;
    }

    const errorResult = this.checkForSaveIssues();

    if (errorResult) {
      event.preventDefault();
      this.showConfirmationModal(errorResult);
    }

    // Otherwise, continue with the save
  }

  /**
   * Restores the original UUID in the editor contents when the user confirms save.
   */
  restoreOriginalUuid() {
    if (!this.fileMetadata?.uuid) return;

    const currentContents = this.editor.getValue();
    const parsedContent = JSON.parse(currentContents);
    if (typeof parsedContent === 'object' && parsedContent !== null) {
      // Restore the original UUID
      parsedContent.uuid = this.fileMetadata.uuid;
      const restoredContents = JSON.stringify(parsedContent, null, 2);
      this.editor.setValue(restoredContents);
    }
  }

  /**
   * Checks for issues that would require confirmation before saving.
   *
   * @returns An error result object or null if there are no issues.
   */
  checkForSaveIssues(): {
    errorCode: SaveErrorCode;
    originalUuid?: string;
    newUuid?: string;
  } | null {
    const currentContents = this.editor.getValue();

    if (this.fileMetadata && this.fileMetadata.type !== FileType.File) {
      try {
        const parsedContent = JSON.parse(currentContents);

        if (typeof parsedContent !== 'object') {
          return { errorCode: SaveErrorCode.INVALID_JSON };
        } else if (this.fileMetadata.uuid) {
          if ('uuid' in parsedContent) {
            if (parsedContent.uuid !== this.fileMetadata.uuid) {
              return {
                errorCode: SaveErrorCode.UUID_CHANGED,
                originalUuid: this.fileMetadata.uuid,
                newUuid: parsedContent.uuid,
              };
            }
          } else {
            return {
              errorCode: SaveErrorCode.UUID_REMOVED,
              originalUuid: this.fileMetadata.uuid,
            };
          }
        }
      } catch {
        return { errorCode: SaveErrorCode.INVALID_JSON };
      }
    }

    return null;
  }

  /**
   * Shows a confirmation modal based on the error code.
   *
   * @param errorResult - The error result containing error code and related data.
   * @param errorResult.errorCode - The type of save error that occurred.
   * @param errorResult.originalUuid - The original UUID value (for UUID errors).
   * @param errorResult.newUuid - The new UUID value (for UUID_CHANGED errors).
   */
  showConfirmationModal(errorResult: {
    errorCode: SaveErrorCode;
    originalUuid?: string;
    newUuid?: string;
  }) {
    const modalElement = document.getElementById('save-confirmation-modal')!;
    const modalTitle = modalElement.querySelector('.modal-title')!;
    const modalBody = modalElement.querySelector('.modal-body')!;
    const confirmButton = modalElement.querySelector<HTMLButtonElement>('#confirm-save-button')!;
    const cancelButton = modalElement.querySelector<HTMLButtonElement>('#cancel-save-button')!;

    const { errorCode, originalUuid, newUuid } = errorResult;

    // Restore original modal styles
    modalTitle.textContent = 'Confirm save';
    confirmButton.style.display = '';
    cancelButton.textContent = 'Cancel';
    cancelButton.className = 'btn btn-secondary';

    // Update modal content based on error code
    switch (errorCode) {
      case SaveErrorCode.INVALID_JSON:
        modalBody.innerHTML = renderHtml(<InvalidJsonModalContent />).toString();
        modalTitle.textContent = 'Cannot save';
        confirmButton.style.display = 'none';
        cancelButton.textContent = 'OK';
        cancelButton.className = 'btn btn-primary';
        break;

      case SaveErrorCode.UUID_CHANGED:
      case SaveErrorCode.UUID_REMOVED:
        modalBody.innerHTML = renderHtml(
          <UuidChangeModalContent
            errorCode={errorCode}
            originalUuid={originalUuid}
            newUuid={newUuid}
          />,
        ).toString();
        modalTitle.textContent = 'Confirm save';
        confirmButton.style.display = '';
        cancelButton.textContent = 'Cancel';
        cancelButton.className = 'btn btn-secondary';
        break;
    }

    const modal = window.bootstrap.Modal.getOrCreateInstance(modalElement);
    modal.show();

    confirmButton.addEventListener(
      'click',
      () => {
        modal.hide();
        this.confirmedSave = true;
        this.saveElement?.click();
      },
      { once: true },
    );
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
      this.inputContentsElement.value = b64EncodeUnicode(this.editor.getValue());
    }
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
