import ace from 'ace-builds';
import CryptoJS from 'crypto-js';

import { onDocumentReady } from '@prairielearn/browser-utils';

class InstructorFileEditor {
  element: HTMLElement;
  origHash?: string;
  saveElement?: HTMLButtonElement | null;
  inputContentsElement?: HTMLInputElement | null;
  editor: ace.Ace.Editor;

  constructor({
    element,
    origHash,
    diskHash,
    saveElementId,
    aceMode,
    readOnly,
    contents,
    altElementId,
    buttonsContainerElementId,
    choiceAlertElementId,
  }: {
    element: HTMLElement;
    origHash?: string;
    diskHash?: string;
    saveElementId?: string;
    aceMode?: string;
    readOnly?: boolean;
    contents?: string;
    altElementId?: string;
    buttonsContainerElementId?: string;
    choiceAlertElementId?: string;
  }) {
    this.element = element;
    const editorElement = element.querySelector<HTMLElement>('.editor');
    if (!editorElement) {
      throw new Error(`Could not find .editor element inside ${element.id}`);
    }

    this.origHash = origHash;
    this.saveElement = saveElementId ? document.querySelector(`#${saveElementId}`) : null;
    this.inputContentsElement = element.querySelector('input[name=file_edit_contents]');
    const inputHashElement = element.querySelector<HTMLInputElement>(
      'input[name=file_edit_orig_hash]',
    );
    this.editor = ace.edit(editorElement, {
      minLines: 10,
      maxLines: Infinity,
      autoScrollEditorIntoView: true,
      wrap: true,
      showPrintMargin: false,
      mode: aceMode,
      readOnly: readOnly || !!altElementId,
      enableKeyboardAccessibility: true,
      theme: 'ace/theme/chrome',
    });

    element.querySelector<HTMLButtonElement>('button[id=choose]')?.addEventListener('click', () => {
      //
      // This is what happens when the user clicks "Choose my version"
      //

      // Replace origHash with diskHash (both what is used for comparison
      // in checkDiff() and what is used for POST)
      this.origHash = diskHash;
      if (inputHashElement) inputHashElement.value = diskHash ?? '';

      // Allow editing "My version" again
      this.editor.setReadOnly(false);

      // Get rid of the editor containing "Their version"
      if (altElementId) document.getElementById(altElementId)?.remove();

      // Get rid of header that presents the version labels and choice buttons
      element.querySelector('.card-header')?.remove();

      // Dismiss alert that says the user needs to make a choice
      if (choiceAlertElementId) document.getElementById(choiceAlertElementId)?.remove();

      // Show div that contains "Show help" and "Save and sync" buttons
      if (buttonsContainerElementId) $(`#${buttonsContainerElementId}`).collapse('show');

      // Enable "save and sync" button again by checking diff on text hash
      this.checkDiff();

      // Allow the editor to resize itself, filling the whole container
      this.editor.resize();
    });

    this.setEditorContents(contents ? this.b64DecodeUnicode(contents) : '');

    this.editor.commands.addCommand({
      name: 'saveAndSync',
      bindKey: { win: 'Ctrl-s', mac: 'Command-s' },
      exec: () => {
        this.saveElement?.click();
      },
    });

    this.editor.getSession().on('change', this.onChange.bind(this));
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
      this.saveElement.disabled = curHash === this.origHash;
    }
  }
}

onDocumentReady(() => {
  document.querySelectorAll<HTMLElement>('.js-file-editor').forEach((element) => {
    new InstructorFileEditor({
      element,
      origHash: element.dataset.origHash,
      diskHash: element.dataset.diskHash,
      saveElementId: element.dataset.saveElementId,
      aceMode: element.dataset.aceMode,
      readOnly: element.dataset.readOnly === 'true',
      contents: element.dataset.contents,
      altElementId: element.dataset.altElementId,
      buttonsContainerElementId: element.dataset.buttonsContainerElementId,
      choiceAlertElementId: element.dataset.choiceAlertElementId,
    });
  });
});
