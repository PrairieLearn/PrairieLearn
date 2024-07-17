import ace from 'ace-builds';
import CryptoJS from 'crypto-js';

import { onDocumentReady } from '@prairielearn/browser-utils';

class InstructorFileEditor {
  element: HTMLElement;
  diskHash?: string;
  saveElement?: HTMLButtonElement | null;
  inputContentsElement?: HTMLInputElement | null;
  editor: ace.Ace.Editor;

  constructor({
    element,
    saveElement,
    aceMode,
    readOnly,
    contents,
  }: {
    element: HTMLElement;
    saveElement?: HTMLButtonElement | null;
    aceMode?: string;
    readOnly?: boolean;
    contents?: string;
  }) {
    this.element = element;
    this.diskHash = element.querySelector<HTMLInputElement>(
      'input[name=file_edit_orig_hash]',
    )?.value;
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

    this.editor.commands.addCommand({
      name: 'saveAndSync',
      bindKey: { win: 'Ctrl-s', mac: 'Command-s' },
      exec: () => {
        this.saveElement?.click();
      },
    });

    this.editor.getSession().on('change', () => this.onChange());
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

  getHash(contents: string) {
    return CryptoJS.SHA256(this.b64EncodeUnicode(contents)).toString();
  }

  checkDiff() {
    if (this.saveElement) {
      const curHash = this.getHash(this.editor.getValue());
      this.saveElement.disabled = curHash === this.diskHash;
    }
  }

  takeOver() {
    this.editor.setReadOnly(false);
    this.checkDiff();
    this.editor.resize();
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
  const draftEditor = draftEditorElement
    ? new InstructorFileEditor({
        element: draftEditorElement,
        aceMode: draftEditorElement.dataset.aceMode,
        readOnly: draftEditorElement.dataset.readOnly === 'true',
        contents: draftEditorElement.dataset.contents,
        saveElement: document.querySelector<HTMLButtonElement>('#file-editor-save-button'),
      })
    : null;

  const diskEditorElement = document.querySelector<HTMLElement>('#file-editor-disk');
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
