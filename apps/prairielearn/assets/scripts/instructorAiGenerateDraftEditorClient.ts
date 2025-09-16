import ace from 'ace-builds';
import { observe } from 'selector-observer';

import { onDocumentReady } from '@prairielearn/browser-utils';

import { configureAceBasePaths } from './lib/ace.js';
import { saveButtonEnabling } from './lib/saveButtonEnabling.js';

class DraftFileEditor extends EventTarget {
  private editor: ace.Ace.Editor;
  private initialContents: string;
  private inputContentsElement?: HTMLInputElement;

  constructor(el: HTMLElement) {
    super();

    const inputContentsName = el.dataset.inputContentsName;
    if (!inputContentsName) {
      throw new Error('Missing data-input-contents-name attribute');
    }

    const selector = `input[name="${inputContentsName}"]`;
    const inputContentsElement = document.querySelector<HTMLInputElement>(selector);
    if (!inputContentsElement) {
      throw new Error(`Missing input element with name ${inputContentsName}`);
    }

    this.inputContentsElement = inputContentsElement;

    this.editor = ace.edit(el, {
      mode: el.dataset.aceMode ?? 'ace/mode/text',
      enableKeyboardAccessibility: true,
      theme: 'ace/theme/chrome',
    } satisfies Partial<ace.Ace.EditorOptions>);

    this.initialContents = this.b64DecodeUnicode(this.inputContentsElement.value);
    this.setEditorContents(this.initialContents);

    this.editor.getSession().on('change', () => {
      this.syncFileToHiddenInput();
      this.dispatchEvent(new Event('change'));
    });

    if (this.editor.getOption('mode') === 'ace/mode/html') {
      this.editor.getSession().setTabSize(2);
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
      encodeURIComponent(str).replaceAll(/%([0-9A-F]{2})/g, (_match, p1) => {
        return String.fromCharCode(Number(`0x${p1}`));
      }),
    );
  }

  didContentsChange(): boolean {
    return this.editor.getValue() !== this.initialContents;
  }
}

onDocumentReady(() => {
  configureAceBasePaths();

  const editorForm = document.querySelector<HTMLFormElement>('.js-editor-form');
  const editorStatus = document.querySelector<HTMLElement>('.js-editor-status');
  const editorSubmitButton = editorForm?.querySelector<HTMLButtonElement>('button[type="submit"]');
  const editors = new Map<HTMLElement, DraftFileEditor>();

  function handleEditorChange() {
    const hasChanges = Array.from(editors.values()).some((e) => e.didContentsChange());
    if (hasChanges) {
      // Enable the save button.
      if (editorStatus) editorStatus.textContent = 'Unsaved changes.';
      editorSubmitButton?.removeAttribute('disabled');
    } else {
      // Disable the save button.
      if (editorStatus) editorStatus.textContent = 'No unsaved changes.';
      editorSubmitButton?.setAttribute('disabled', 'true');
    }
  }

  // Wire up the editors.
  observe('.js-file-editor', {
    constructor: HTMLDivElement,
    add(el) {
      const editor = new DraftFileEditor(el);
      editor.addEventListener('change', handleEditorChange);

      editors.set(el, editor);
      handleEditorChange();
    },
    remove(el) {
      editors.delete(el);
    },
  });

  // Disable the "Revise question" button until the form is changed.
  const revisionForm = document.querySelector<HTMLFormElement>('.js-revision-form');
  const submitButton = revisionForm?.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (revisionForm && submitButton) {
    saveButtonEnabling(revisionForm, submitButton);
  }

  // Submit the form when Enter is pressed. Shift+Enter will insert a newline.
  document.querySelector<HTMLElement>('#user-prompt-llm')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (e.currentTarget instanceof HTMLElement) {
        e.currentTarget.closest('form')?.requestSubmit();
      }
    }
  });

  // Scroll chat to bottom on load
  const chatHistory = document.querySelector<HTMLElement>('.app-chat-history');
  if (chatHistory) {
    chatHistory.scrollTop = chatHistory.scrollHeight;
  }

  // Enable chat width resizing via drag handle
  // TODO: Keyboard support for resizing the chat width.
  const container = document.querySelector<HTMLElement>('.app-container');
  const resizer = document.querySelector<HTMLElement>('.app-chat-resizer');
  const chat = document.querySelector<HTMLElement>('.app-chat');
  if (container && resizer && chat) {
    let startX = 0;
    let startWidth = 0;
    const minWidth = 260;
    const maxWidth = 800;

    const onMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - startX;
      const newWidth = Math.min(maxWidth, Math.max(minWidth, startWidth + dx));
      container.style.setProperty('--chat-width', `${newWidth}px`);
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.classList.remove('user-select-none');
    };

    resizer.addEventListener('mousedown', (e) => {
      startX = e.clientX;
      const styles = getComputedStyle(container);
      const current = styles.getPropertyValue('--chat-width').trim() || '400px';
      startWidth = Number.parseInt(current) || chat.getBoundingClientRect().width;
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
      document.body.classList.add('user-select-none');
    });
  }
});
