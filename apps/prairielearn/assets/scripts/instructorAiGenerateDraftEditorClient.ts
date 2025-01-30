import ace from 'ace-builds';
import { observe } from 'selector-observer';

import { onDocumentReady } from '@prairielearn/browser-utils';

class DraftFileEditor {
  private editor: ace.Ace.Editor;

  constructor(el: HTMLElement) {
    const mode = el.dataset.aceMode;

    this.editor = ace.edit(el, {
      mode: mode ?? 'ace/mode/text',
      enableKeyboardAccessibility: true,
      theme: 'ace/theme/chrome',
      // TODO: make this editable once we have a way to save the contents.
      readOnly: true,
    } satisfies Partial<ace.Ace.EditorOptions>);

    this.setEditorContents(this.b64DecodeUnicode(el.dataset.contents ?? ''));

    window.editor = this.editor;

    this.editor.resize();
  }

  setEditorContents(contents: string) {
    console.log('setting contents', contents);
    // use session.setValue to reset the undo stack as well
    this.editor.getSession().setValue(contents);
    this.editor.gotoLine(1, 0, false);
    this.editor.focus();
    this.syncFileToHiddenInput();
  }

  syncFileToHiddenInput() {
    // TODO: enable once we have a way to save the contents.
    // if (this.inputContentsElement) {
    //   this.inputContentsElement.value = this.b64EncodeUnicode(this.editor.getValue());
    // }
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
}

onDocumentReady(() => {
  // ace loads modes/themes dynamically as needed, but its unable to identify
  // the base path implicitly when using compiled assets. We explicitly set the
  // base path for modes/themes here based on the meta tag set in the document,
  // which is computed server-side based on the asset path for the ace-builds
  // module.
  const aceBasePath =
    document.querySelector('meta[name="ace-base-path"]')?.getAttribute('content') ?? null;
  ace.config.set('modePath', aceBasePath);
  ace.config.set('workerPath', aceBasePath);
  ace.config.set('themePath', aceBasePath);

  observe('.js-file-editor', {
    constructor: HTMLDivElement,
    add(el) {
      new DraftFileEditor(el);
    },
  });
});
